import { randomUUID } from 'node:crypto';
import {
  type Prisma,
  type PrismaClient,
  RelationStatus,
  ScoreRecordType,
  StudentStatus,
  TeacherRole,
} from '@prisma/client';
import { prisma } from '../../plugins/prisma';
import { BusinessError } from '../../plugins/error-handler';
import { ClassEventType } from '../realtime/realtime.types';
import { realtimeService } from '../realtime/realtime.service';
import {
  normalizeCommitteeAssignments,
  scorePeriodsService,
  type CommitteeAssignmentInput,
} from './score-periods.service';
import { summarizeScoreEvent } from './score-event-summary';

const scoreRecordInclude = {
  student: { select: { id: true, name: true } },
  operator: { select: { id: true, name: true } },
  rule: { select: { id: true, name: true } },
  event: { select: { type: true, parameters: true } },
  reversion: { select: { id: true } },
} satisfies Prisma.ScoreRecordInclude;

type ScoreRecordWithRelations = Prisma.ScoreRecordGetPayload<{
  include: typeof scoreRecordInclude;
}>;

export class ScoresService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async assertClassAccess(userId: string, classId: string, roles?: TeacherRole[]) {
    const access = await this.db.classTeacher.findFirst({
      where: {
        teacherId: userId,
        classId,
        status: RelationStatus.ACTIVE,
        ...(roles?.length ? { role: { in: roles } } : {}),
      },
    });
    if (!access) {
      throw new BusinessError('FORBIDDEN_CLASS_ACCESS', '无权访问该班级', 403);
    }
    return access;
  }

  // --- Score Rules ---
  async listRules(classId: string, enabled?: boolean) {
    return this.db.scoreRule.findMany({
      where: {
        classId,
        ...(enabled !== undefined ? { enabled } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async createRule(
    classId: string,
    operatorId: string,
    dto: {
      name: string;
      delta: number;
      group?: string;
      description?: string;
      systemPolicyKey?: string;
    },
  ) {
    if (!Number.isInteger(dto.delta) || dto.delta === 0) {
      throw new BusinessError('INVALID_SCORE_DELTA', '积分值必须为非 0 整数', 400);
    }
    const name = dto.name.trim();
    if (!name) {
      throw new BusinessError('INVALID_SCORE_RULE_NAME', '积分规则名称不能为空', 400);
    }

    await this.assertClassAccess(operatorId, classId, [TeacherRole.HEAD_TEACHER]);

    return this.db.scoreRule.create({
      data: {
        classId,
        name,
        group: dto.group?.trim() || undefined,
        delta: dto.delta,
        description: dto.description ?? null,
        systemPolicyKey: dto.systemPolicyKey?.trim() || null,
        createdBy: operatorId,
      },
    });
  }

  async updateRule(
    classId: string,
    ruleId: string,
    operatorId: string,
    dto: {
      name?: string;
      delta?: number;
      group?: string;
      description?: string;
      systemPolicyKey?: string;
      enabled?: boolean;
    },
  ) {
    await this.assertClassAccess(operatorId, classId, [TeacherRole.HEAD_TEACHER]);
    if (dto.delta !== undefined && (!Number.isInteger(dto.delta) || dto.delta === 0)) {
      throw new BusinessError('INVALID_SCORE_DELTA', '积分值必须为非 0 整数', 400);
    }

    const existing = await this.db.scoreRule.findFirst({ where: { id: ruleId, classId } });
    if (!existing) {
      throw new BusinessError('SCORE_RULE_NOT_FOUND', '积分规则不存在', 404);
    }

    return this.db.scoreRule.update({
      where: { id: ruleId },
      data: {
        name: dto.name?.trim(),
        group: dto.group?.trim(),
        delta: dto.delta,
        description: dto.description,
        systemPolicyKey: dto.systemPolicyKey?.trim(),
        enabled: dto.enabled,
      },
    });
  }

  async disableRule(classId: string, ruleId: string, operatorId: string) {
    await this.assertClassAccess(operatorId, classId, [TeacherRole.HEAD_TEACHER]);
    const existing = await this.db.scoreRule.findFirst({ where: { id: ruleId, classId } });
    if (!existing) {
      throw new BusinessError('SCORE_RULE_NOT_FOUND', '积分规则不存在', 404);
    }

    return this.db.scoreRule.update({
      where: { id: ruleId },
      data: { enabled: false },
    });
  }

  // --- Score Records ---
  async createFromRule(
    classId: string,
    operatorId: string,
    dto: { studentId: string; ruleId: string },
  ) {
    const access = await this.assertClassAccess(operatorId, classId);
    const period = await scorePeriodsService.ensurePeriodForDate(classId, new Date());

    const record = await this.db.$transaction(async (tx) => {
      const [student, rule] = await Promise.all([
        tx.student.findFirst({
          where: { id: dto.studentId, classId, status: StudentStatus.ACTIVE, deletedAt: null },
          select: { id: true },
        }),
        tx.scoreRule.findFirst({
          where: { id: dto.ruleId, classId },
          select: { id: true, delta: true, enabled: true },
        }),
      ]);

      if (!student) throw new BusinessError('STUDENT_NOT_FOUND', '学生不存在', 404);
      if (!rule) throw new BusinessError('SCORE_RULE_NOT_FOUND', '积分规则不存在', 404);
      if (!rule.enabled) throw new BusinessError('SCORE_RULE_DISABLED', '该积分规则已停用', 400);

      return tx.scoreRecord.create({
        data: {
          classId,
          studentId: student.id,
          operatorId,
          subject: access.subject,
          ruleId: rule.id,
          periodId: period.id,
          delta: rule.delta,
          recordType: ScoreRecordType.NORMAL,
          occurredAt: new Date(),
          violation: rule.delta < 0,
        },
        include: scoreRecordInclude,
      });
    });

    this.publishScoreChanged(classId, record.studentId, record.delta);
    return this.toResponse(record);
  }

  async createCustom(
    classId: string,
    operatorId: string,
    dto: { studentId: string; delta: number; reason: string },
  ) {
    if (!Number.isInteger(dto.delta) || dto.delta === 0) {
      throw new BusinessError('INVALID_SCORE_DELTA', '积分值必须为非 0 整数', 400);
    }
    const reason = dto.reason.trim();
    if (reason.length < 10) {
      throw new BusinessError('INVALID_SCORE_REASON', '自定义积分原因至少需要 10 个字符', 400);
    }

    const access = await this.assertClassAccess(operatorId, classId);
    const period = await scorePeriodsService.ensurePeriodForDate(classId, new Date());

    const record = await this.db.$transaction(async (tx) => {
      const student = await tx.student.findFirst({
        where: { id: dto.studentId, classId, status: StudentStatus.ACTIVE, deletedAt: null },
        select: { id: true },
      });
      if (!student) throw new BusinessError('STUDENT_NOT_FOUND', '学生不存在', 404);

      return tx.scoreRecord.create({
        data: {
          classId,
          studentId: student.id,
          operatorId,
          subject: access.subject,
          periodId: period.id,
          delta: dto.delta,
          reason,
          recordType: ScoreRecordType.NORMAL,
          occurredAt: new Date(),
          violation: dto.delta < 0,
        },
        include: scoreRecordInclude,
      });
    });

    this.publishScoreChanged(classId, record.studentId, record.delta);
    return this.toResponse(record);
  }

  private publishScoreChanged(classId: string, studentId: string, delta: number): void {
    const occurredAt = new Date().toISOString();
    realtimeService.publishClassEvent(classId, {
      id: randomUUID(),
      type: ClassEventType.SCORE_CHANGED,
      classId,
      occurredAt,
      payload: { studentId, direction: delta > 0 ? 'INCREASE' : 'DECREASE', delta },
    });
    realtimeService.publishClassEvent(classId, {
      id: `${classId}-ranking-${Date.now()}`,
      type: ClassEventType.RANKING_CHANGED,
      classId,
      occurredAt,
      payload: { period: 'MONTH' },
    });
  }

  async listRecords(
    classId: string,
    query: {
      page?: number;
      pageSize?: number;
      studentId?: string;
      operatorId?: string;
      recordType?: ScoreRecordType;
      from?: string;
      to?: string;
    },
  ) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));

    const where: Prisma.ScoreRecordWhereInput = {
      classId,
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.operatorId ? { operatorId: query.operatorId } : {}),
      ...(query.recordType ? { recordType: query.recordType } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    if (query.from && Number.isNaN(new Date(query.from).getTime())) {
      throw new BusinessError('INVALID_SCORE_DATE_RANGE', '积分流水时间范围无效');
    }
    if (query.to && Number.isNaN(new Date(query.to).getTime())) {
      throw new BusinessError('INVALID_SCORE_DATE_RANGE', '积分流水时间范围无效');
    }
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BusinessError('INVALID_SCORE_DATE_RANGE', '开始时间不能晚于结束时间');
    }

    const [records, total] = await this.db.$transaction([
      this.db.scoreRecord.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: scoreRecordInclude,
      }),
      this.db.scoreRecord.count({ where }),
    ]);

    return {
      data: records.map((record) => this.toResponse(record)),
      meta: { page, pageSize, total },
    };
  }

  async revertRecord(classId: string, recordId: string, operatorId: string) {
    const access = await this.assertClassAccess(operatorId, classId);

    const record = await this.db.$transaction(async (tx) => {
      const original = await tx.scoreRecord.findFirst({
        where: { id: recordId, classId },
        include: { reversion: true },
      });

      if (!original) {
        throw new BusinessError('SCORE_RECORD_NOT_FOUND', '积分记录不存在', 404);
      }
      if (original.recordType !== ScoreRecordType.NORMAL) {
        throw new BusinessError('CANNOT_REVERT_REVERT_RECORD', '撤销记录不能被再次撤销', 400);
      }
      if (original.reversion) {
        throw new BusinessError('SCORE_RECORD_ALREADY_REVERTED', '该积分记录已被撤销', 409);
      }

      // Subject teachers can only revert their own records
      if (access.role !== TeacherRole.HEAD_TEACHER && original.operatorId !== operatorId) {
        throw new BusinessError('FORBIDDEN_SCORE_REVERT', '任课教师只能撤销本人登记的积分', 403);
      }

      return tx.scoreRecord.create({
        data: {
          classId,
          studentId: original.studentId,
          operatorId,
          subject: access.subject,
          ruleId: original.ruleId,
          periodId: original.periodId,
          eventId: original.eventId,
          delta: -original.delta,
          reason: `撤销记录 ${original.id}`,
          recordType: ScoreRecordType.REVERT,
          revertedRecordId: original.id,
          occurredAt: new Date(),
          violation: false,
        },
        include: scoreRecordInclude,
      });
    });

    realtimeService.publishClassEvent(classId, {
      id: randomUUID(),
      type: ClassEventType.SCORE_REVERTED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: {
        studentId: record.studentId,
        recordId,
        delta: record.delta,
      },
    });
    realtimeService.publishClassEvent(classId, {
      id: randomUUID(),
      type: ClassEventType.RANKING_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: { period: 'MONTH' },
    });

    return this.toResponse(record);
  }

  private toResponse(record: ScoreRecordWithRelations) {
    return {
      id: record.id,
      student: record.student,
      operator: record.operator,
      periodId: record.periodId ?? null,
      eventId: record.eventId ?? null,
      event: summarizeScoreEvent(record.event),
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

  // --- Committee ---
  async listCommittee(classId: string) {
    const assignments = await this.db.classCommitteeAssignment.findMany({
      where: {
        classId,
        status: RelationStatus.ACTIVE,
        student: { status: StudentStatus.ACTIVE, deletedAt: null },
      },
      include: { student: { select: { name: true } } },
      orderBy: [{ role: 'asc' }, { termStartAt: 'desc' }, { studentId: 'asc' }],
    });
    return assignments.map((a) => ({
      id: a.id,
      studentId: a.studentId,
      studentName: a.student.name,
      role: a.role,
      subject: a.subject,
      termStartAt: a.termStartAt,
      termEndAt: a.termEndAt,
      trialEndsAt: a.trialEndsAt,
      status: a.status,
    }));
  }

  async replaceCommittee(
    classId: string,
    operatorId: string,
    assignments: CommitteeAssignmentInput[],
  ) {
    await this.assertClassAccess(operatorId, classId, [TeacherRole.HEAD_TEACHER]);
    const normalizedAssignments = normalizeCommitteeAssignments(assignments);
    const replacementAt = new Date();

    await this.db.$transaction(async (tx) => {
      const studentIds = [
        ...new Set(normalizedAssignments.map((assignment) => assignment.studentId)),
      ];
      if (studentIds.length > 0) {
        const students = await tx.student.findMany({
          where: { classId, id: { in: studentIds }, status: StudentStatus.ACTIVE, deletedAt: null },
          select: { id: true },
        });
        if (students.length !== studentIds.length) {
          throw new BusinessError('INVALID_COMMITTEE_STUDENT', '班委必须是本班在班学生', 400);
        }
      }

      const existingAssignments = await tx.classCommitteeAssignment.findMany({
        where: { classId },
        select: {
          id: true,
          studentId: true,
          role: true,
          subject: true,
          termStartAt: true,
          termEndAt: true,
          trialEndsAt: true,
          status: true,
        },
      });
      const existingByKey = new Map(
        existingAssignments.map((assignment) => [
          `${assignment.studentId}\u0000${assignment.role}\u0000${assignment.termStartAt.getTime()}`,
          assignment,
        ]),
      );

      const desiredByKey = new Map(
        normalizedAssignments.map((assignment) => [
          `${assignment.studentId}\u0000${assignment.role}\u0000${assignment.termStartAt.getTime()}`,
          assignment,
        ]),
      );

      for (const existing of existingAssignments) {
        const key = `${existing.studentId}\u0000${existing.role}\u0000${existing.termStartAt.getTime()}`;
        const desired = desiredByKey.get(key);
        if (!desired) {
          if (existing.status === RelationStatus.ACTIVE) {
            await tx.classCommitteeAssignment.update({
              where: { id: existing.id },
              data: {
                status: RelationStatus.REVOKED,
                termEndAt:
                  existing.termEndAt && existing.termEndAt < replacementAt
                    ? existing.termEndAt
                    : replacementAt,
              },
            });
          }
          continue;
        }

        if (
          existing.status !== RelationStatus.ACTIVE ||
          existing.subject !== desired.subject ||
          existing.termEndAt?.getTime() !== desired.termEndAt?.getTime() ||
          existing.trialEndsAt?.getTime() !== desired.trialEndsAt?.getTime()
        ) {
          await tx.classCommitteeAssignment.update({
            where: { id: existing.id },
            data: {
              subject: desired.subject,
              termEndAt: desired.termEndAt,
              trialEndsAt: desired.trialEndsAt,
              status: RelationStatus.ACTIVE,
            },
          });
        }
      }

      const newAssignments = normalizedAssignments.filter(
        (assignment) =>
          !existingByKey.has(
            `${assignment.studentId}\u0000${assignment.role}\u0000${assignment.termStartAt.getTime()}`,
          ),
      );
      if (newAssignments.length > 0) {
        await tx.classCommitteeAssignment.createMany({
          data: newAssignments.map((assignment) => ({
            classId,
            studentId: assignment.studentId,
            role: assignment.role,
            subject: assignment.subject,
            termStartAt: assignment.termStartAt,
            termEndAt: assignment.termEndAt,
            trialEndsAt: assignment.trialEndsAt,
            status: RelationStatus.ACTIVE,
          })),
        });
      }
    });

    return this.listCommittee(classId);
  }

  // --- Periods summary ---
  async getPeriodsSummary(classId: string, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const records = await this.db.scoreRecord.findMany({
      where: {
        classId,
        createdAt: { gte: fromDate, lte: toDate },
      },
      select: {
        studentId: true,
        delta: true,
        recordType: true,
      },
    });

    const totalDelta = records.reduce((sum, r) => sum + r.delta, 0);
    const totalRecords = records.length;

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      totalRecords,
      totalDelta,
    };
  }
}

export const scoresService = new ScoresService();
