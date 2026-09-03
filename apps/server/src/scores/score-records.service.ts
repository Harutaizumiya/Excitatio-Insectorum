import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import {
  Prisma,
  RelationStatus,
  ScoreRecordType,
  StudentStatus,
  TeacherRole,
} from '@prisma/client';
import { BusinessException, ClassEventType } from '../common';
import { isPostgresDatabase, PrismaService } from '../prisma';
import { RealtimeService } from '../realtime/realtime.service';
import { ScorePeriodsService } from './score-periods.service';
import type {
  CreateCustomScoreDto,
  CreateRuleScoreDto,
  ListScoreRecordsQueryDto,
  ScoreRecordResponseDto,
} from './dto';

const scoreRecordInclude = Prisma.validator<Prisma.ScoreRecordInclude>()({
  student: { select: { id: true, name: true } },
  operator: { select: { id: true, name: true } },
  rule: { select: { id: true, name: true } },
  reversion: { select: { id: true } },
});

type ScoreRecordWithRelations = Prisma.ScoreRecordGetPayload<{
  include: typeof scoreRecordInclude;
}>;

interface LockedScoreRecord {
  id: string;
  classId: string;
  studentId: string;
  operatorId: string;
  ruleId: string | null;
  periodId?: string | null;
  eventId?: string | null;
  delta: number;
  recordType: ScoreRecordType;
  occurredAt?: Date | null;
  violation?: boolean;
}

@Injectable()
export class ScoreRecordsService {
  private readonly logger = new Logger(ScoreRecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    @Optional() private readonly periods?: ScorePeriodsService,
  ) {}

  async createFromRule(
    classId: string,
    operatorId: string,
    dto: CreateRuleScoreDto,
  ): Promise<ScoreRecordResponseDto> {
    const period = this.periods ? await this.periods.ensureCurrentPeriod(classId, operatorId) : null;
    const record = await this.prisma.$transaction(async (tx) => {
      const [student, operator, rule] = await Promise.all([
        tx.student.findFirst({
          where: { id: dto.studentId, classId, status: StudentStatus.ACTIVE },
          select: { id: true },
        }),
        this.findActiveOperator(tx, classId, operatorId),
        tx.scoreRule.findFirst({
          where: { id: dto.ruleId, classId },
          select: { id: true, delta: true, enabled: true },
        }),
      ]);

      if (!student) this.throwStudentNotFound();
      if (!operator) this.throwInvalidOperator();
      if (!rule) this.throwRuleNotFound();
      if (!rule.enabled) {
        throw new BusinessException('SCORE_RULE_DISABLED', '该积分规则已停用');
      }
      this.assertNonZeroDelta(rule.delta);

      return tx.scoreRecord.create({
        data: {
          classId,
          studentId: student.id,
          operatorId,
          subject: operator.subject,
          ruleId: rule.id,
          delta: rule.delta,
          reason: null,
          recordType: ScoreRecordType.NORMAL,
          ...(period ? { periodId: period.id, occurredAt: new Date(), violation: rule.delta < 0 } : {}),
        },
        include: scoreRecordInclude,
      });
    });

    await this.publishScoreChanged(classId, record.studentId, record.delta);
    return this.toResponse(record);
  }

  async createCustom(
    classId: string,
    operatorId: string,
    dto: CreateCustomScoreDto,
  ): Promise<ScoreRecordResponseDto> {
    this.assertNonZeroDelta(dto.delta);
    const reason = dto.reason.trim();
    if (reason.length < 10) {
      throw new BusinessException('INVALID_SCORE_REASON', '自定义积分原因至少需要 10 个字符');
    }

    const period = this.periods ? await this.periods.ensureCurrentPeriod(classId, operatorId) : null;
    const record = await this.prisma.$transaction(async (tx) => {
      const [student, operator] = await Promise.all([
        tx.student.findFirst({
          where: { id: dto.studentId, classId, status: StudentStatus.ACTIVE },
          select: { id: true },
        }),
        this.findActiveOperator(tx, classId, operatorId),
      ]);

      if (!student) this.throwStudentNotFound();
      if (!operator) this.throwInvalidOperator();

      return tx.scoreRecord.create({
        data: {
          classId,
          studentId: student.id,
          operatorId,
          subject: operator.subject,
          ruleId: null,
          delta: dto.delta,
          reason,
          recordType: ScoreRecordType.NORMAL,
          ...(period ? { periodId: period.id, occurredAt: new Date(), violation: dto.delta < 0 } : {}),
        },
        include: scoreRecordInclude,
      });
    });

    await this.publishScoreChanged(classId, record.studentId, record.delta);
    return this.toResponse(record);
  }

  async list(classId: string, query: ListScoreRecordsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const createdAt = this.buildDateFilter(query.from, query.to);
    const where: Prisma.ScoreRecordWhereInput = {
      classId,
      studentId: query.studentId,
      operatorId: query.operatorId,
      createdAt,
    };

    const [records, total] = await this.prisma.$transaction([
      this.prisma.scoreRecord.findMany({
        where,
        include: scoreRecordInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.scoreRecord.count({ where }),
    ]);

    return {
      data: records.map((record) => this.toResponse(record)),
      meta: { page, pageSize, total },
    };
  }

  async revert(
    classId: string,
    recordId: string,
    operatorId: string,
  ): Promise<ScoreRecordResponseDto> {
    let reverted: ScoreRecordWithRelations;
    try {
      reverted = await this.prisma.$transaction(async (tx) => {
        const original = isPostgresDatabase()
          ? (
              await tx.$queryRaw<LockedScoreRecord[]>(Prisma.sql`
                SELECT "id", "classId", "studentId", "operatorId", "ruleId", "periodId", "eventId", "delta", "recordType", "occurredAt", "violation"
                FROM "ScoreRecord"
                WHERE "id" = ${recordId} AND "classId" = ${classId}
                FOR UPDATE
              `)
            )[0]
          : await tx.scoreRecord.findFirst({
              where: { id: recordId, classId },
              select: {
                id: true,
                classId: true,
                studentId: true,
                operatorId: true,
                ruleId: true,
                periodId: true,
                eventId: true,
                delta: true,
                recordType: true,
                occurredAt: true,
                violation: true,
              },
            });
        if (!original) {
          throw new BusinessException(
            'SCORE_RECORD_NOT_FOUND',
            '积分记录不存在',
            HttpStatus.NOT_FOUND,
          );
        }
        if (original.recordType !== ScoreRecordType.NORMAL) {
          throw new BusinessException('SCORE_RECORD_NOT_REVERTIBLE', '撤销记录不能再次撤销');
        }

        const [existingReversion, operator] = await Promise.all([
          tx.scoreRecord.findUnique({
            where: { revertedRecordId: original.id },
            select: { id: true },
          }),
          this.findActiveOperator(tx, classId, operatorId),
        ]);
        if (existingReversion) {
          throw new BusinessException(
            'SCORE_RECORD_ALREADY_REVERTED',
            '该积分记录已经撤销',
            HttpStatus.CONFLICT,
          );
        }
        if (!operator) this.throwInvalidOperator();
        if (operator.role === TeacherRole.SUBJECT_TEACHER && original.operatorId !== operatorId) {
          throw new BusinessException(
            'FORBIDDEN_SCORE_REVERT',
            '任课教师只能撤销自己创建的积分记录',
            HttpStatus.FORBIDDEN,
          );
        }

        return tx.scoreRecord.create({
          data: {
            classId,
            studentId: original.studentId,
            operatorId,
            subject: operator.subject,
            ruleId: original.ruleId,
            periodId: original.periodId ?? null,
            eventId: original.eventId ?? null,
            delta: -original.delta,
            reason: `撤销积分记录 ${original.id}`,
            recordType: ScoreRecordType.REVERT,
            occurredAt: new Date(),
            violation: false,
            revertedRecordId: original.id,
          },
          include: scoreRecordInclude,
        });
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BusinessException(
          'SCORE_RECORD_ALREADY_REVERTED',
          '该积分记录已经撤销',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }

    await this.publishSafely(classId, [
      {
        id: randomUUID(),
        type: ClassEventType.SCORE_REVERTED,
        classId,
        occurredAt: new Date().toISOString(),
        payload: { studentId: reverted.studentId, recordId },
      },
      this.rankingChangedEvent(classId),
    ]);
    return this.toResponse(reverted);
  }

  private async findActiveOperator(
    tx: Prisma.TransactionClient,
    classId: string,
    operatorId: string,
  ) {
    return tx.classTeacher.findFirst({
      where: {
        classId,
        teacherId: operatorId,
        status: RelationStatus.ACTIVE,
        role: { in: [TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER] },
      },
      select: { role: true, subject: true },
    });
  }

  private buildDateFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (
      (fromDate && Number.isNaN(fromDate.getTime())) ||
      (toDate && Number.isNaN(toDate.getTime()))
    ) {
      throw new BusinessException('INVALID_SCORE_DATE_RANGE', '积分流水时间范围无效');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new BusinessException('INVALID_SCORE_DATE_RANGE', '开始时间不能晚于结束时间');
    }
    return { gte: fromDate, lte: toDate };
  }

  private async publishScoreChanged(
    classId: string,
    studentId: string,
    delta: number,
  ): Promise<void> {
    await this.publishSafely(classId, [
      {
        id: randomUUID(),
        type: ClassEventType.SCORE_CHANGED,
        classId,
        occurredAt: new Date().toISOString(),
        payload: { studentId, direction: delta > 0 ? 'INCREASE' : 'DECREASE' },
      },
      this.rankingChangedEvent(classId),
    ]);
  }

  private rankingChangedEvent(classId: string) {
    return {
      id: randomUUID(),
      type: ClassEventType.RANKING_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: { period: 'WEEK' as const },
    };
  }

  private async publishSafely(
    classId: string,
    events: Parameters<RealtimeService['publishClassEvent']>[1][],
  ): Promise<void> {
    const results = await Promise.allSettled(
      events.map(async (event) => this.realtime.publishClassEvent(classId, event)),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(
          `Realtime event publication failed after score commit: ${String(result.reason)}`,
        );
      }
    }
  }

  private toResponse(record: ScoreRecordWithRelations): ScoreRecordResponseDto {
    return {
      id: record.id,
      student: record.student,
      operator: record.operator,
      periodId: record.periodId ?? null,
      eventId: record.eventId ?? null,
      subject: record.subject,
      rule: record.rule,
      delta: record.delta,
      reason: record.reason,
      recordType: record.recordType,
      reverted: record.reversion !== null,
      violation: record.violation,
      occurredAt: record.occurredAt ?? record.createdAt,
      createdAt: record.createdAt,
    };
  }

  private assertNonZeroDelta(delta: number): void {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new BusinessException('INVALID_SCORE_DELTA', '积分值必须为非 0 整数');
    }
  }

  private throwStudentNotFound(): never {
    throw new BusinessException('STUDENT_NOT_FOUND', '学生不存在或已停用', HttpStatus.NOT_FOUND);
  }

  private throwRuleNotFound(): never {
    throw new BusinessException('SCORE_RULE_NOT_FOUND', '积分规则不存在', HttpStatus.NOT_FOUND);
  }

  private throwInvalidOperator(): never {
    throw new BusinessException(
      'FORBIDDEN_CLASS_ACCESS',
      '当前教师在该班级没有有效关系',
      HttpStatus.FORBIDDEN,
    );
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError ||
      (typeof error === 'object' && error !== null && 'code' in error)
      ? (error as { code?: string }).code === 'P2002'
      : false;
  }
}
