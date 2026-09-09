import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  RelationStatus,
  ScoreEventType,
  ScoreRecordType,
  TeacherRole,
} from '@prisma/client';
import { BusinessException, ClassEventType } from '../common';
import { PrismaService } from '../prisma';
import { RealtimeService } from '../realtime/realtime.service';
import type { CreateScoreEventDto } from './dto';
import { fixedRankDelta, getTaipeiDateKey } from './score-event.types';
import { ScorePeriodsService } from './score-periods.service';

const eventInclude = {
  participants: { select: { studentId: true } },
  scoreRecords: { select: { studentId: true, delta: true } },
} satisfies Prisma.ScoreEventInclude;

type EventWithResults = Prisma.ScoreEventGetPayload<{ include: typeof eventInclude }>;

const manualEventTypes = new Set<ScoreEventType>([
  ScoreEventType.HOMEWORK_MISSING,
  ScoreEventType.HOMEWORK_PRAISE,
  ScoreEventType.BREAKTHROUGH,
  ScoreEventType.PROGRESS,
  ScoreEventType.DUTY_HYGIENE,
  ScoreEventType.DORM_HYGIENE,
  ScoreEventType.MANUAL,
]);

const systemEventTypes = new Set<ScoreEventType>([
  ScoreEventType.NO_VIOLATION_REWARD,
  ScoreEventType.COMMITTEE_REWARD,
]);

@Injectable()
export class ScoreEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: ScorePeriodsService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(classId: string, operatorId: string, dto: CreateScoreEventDto) {
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BusinessException('INVALID_SCORE_EVENT_DATE', '事件发生时间无效');
    }
    this.validateEventInput(dto);

    await this.periods.ensureCurrentPeriod(classId, operatorId);
    const period = await this.periods.ensurePeriodForDate(classId, occurredAt);
    const result = await this.prisma.$transaction(async (tx) => {
      const operator = await tx.classTeacher.findFirst({
        where: {
          classId,
          teacherId: operatorId,
          status: RelationStatus.ACTIVE,
          role: { in: [TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER] },
        },
        select: { teacherId: true, subject: true },
      });
      if (!operator) {
        throw new BusinessException(
          'FORBIDDEN_CLASS_ACCESS',
          '当前教师在该班级没有有效关系',
          HttpStatus.FORBIDDEN,
        );
      }

      if (dto.businessKey) {
        const existing = await tx.scoreEvent.findUnique({
          where: { businessKey: dto.businessKey },
          include: eventInclude,
        });
        if (existing) {
          if (existing.classId !== classId) {
            throw new BusinessException(
              'SCORE_EVENT_BUSINESS_KEY_CONFLICT',
              '事件业务键已被其他班级使用',
              HttpStatus.CONFLICT,
            );
          }
          return existing;
        }
      }

      const students = await tx.student.findMany({
        where: { classId, id: { in: dto.studentIds }, status: 'ACTIVE' },
        select: { id: true },
      });
      if (students.length !== dto.studentIds.length) {
        throw new BusinessException(
          'STUDENT_NOT_FOUND',
          '事件学生必须是本班在班学生',
          HttpStatus.NOT_FOUND,
        );
      }

      const deltas = await this.calculateDeltas(tx, classId, period.id, occurredAt, dto);
      const reason = dto.reason?.trim() || null;
      const event = await tx.scoreEvent.create({
        data: {
          classId,
          periodId: period.id,
          type: dto.type,
          operatorId,
          occurredAt,
          reason,
          businessKey: dto.businessKey ?? null,
          parameters: JSON.stringify({
            rank: dto.rank,
            minutesLate: dto.minutesLate,
            manualDelta: dto.manualDelta,
            isOrganizer: dto.isOrganizer ?? false,
            specialContribution: dto.specialContribution ?? false,
            subject: dto.subject ?? operator.subject,
            deltas,
          }),
        },
      });
      await tx.scoreEventParticipant.createMany({
        data: dto.studentIds.map((studentId) => ({ eventId: event.id, studentId })),
      });

      const recordData = dto.studentIds
        .map((studentId, index) => ({ studentId, delta: deltas[index] }))
        .filter((resultItem) => resultItem.delta !== 0);
      if (recordData.length > 0) {
        await tx.scoreRecord.createMany({
          data: recordData.map((resultItem) => ({
            classId,
            studentId: resultItem.studentId,
            operatorId,
            subject: dto.subject?.trim() || operator.subject,
            periodId: period.id,
            eventId: event.id,
            delta: resultItem.delta,
            reason,
            recordType: ScoreRecordType.NORMAL,
            occurredAt,
            violation: this.isViolation(dto.type, resultItem.delta),
          })),
        });
      }

      return tx.scoreEvent.findUniqueOrThrow({ where: { id: event.id }, include: eventInclude });
    });

    if (result.scoreRecords.length > 0) {
      await Promise.allSettled([
        ...result.scoreRecords.map((record) =>
          this.realtime.publishClassEvent(classId, {
            id: randomUUID(),
            type: ClassEventType.SCORE_CHANGED,
            classId,
            occurredAt: new Date().toISOString(),
            payload: {
              studentId: record.studentId,
              direction: record.delta > 0 ? 'INCREASE' : 'DECREASE',
            },
          }),
        ),
        this.realtime.publishClassEvent(classId, {
          id: randomUUID(),
          type: ClassEventType.RANKING_CHANGED,
          classId,
          occurredAt: new Date().toISOString(),
          payload: { period: 'MONTH' },
        }),
      ]);
    }
    return this.toResponse(result);
  }

  private validateEventInput(dto: CreateScoreEventDto): void {
    if (systemEventTypes.has(dto.type)) {
      throw new BusinessException(
        'SCORE_EVENT_SYSTEM_ONLY',
        '该事件由周期结算生成',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      dto.type === ScoreEventType.LATE &&
      (!Number.isInteger(dto.minutesLate) || dto.minutesLate! < 1)
    ) {
      throw new BusinessException('INVALID_SCORE_EVENT_VALUE', '迟到分钟数必须为正整数');
    }
    const rankTypes = new Set<ScoreEventType>([
      ScoreEventType.NOISIEST_CLASS_TOP3,
      ScoreEventType.EXAM_GRADE_TOP10,
      ScoreEventType.SUBJECT_TOP3,
      ScoreEventType.BLACKBOARD,
      ScoreEventType.INDIVIDUAL_ACTIVITY,
      ScoreEventType.SPORTS_FINAL_TOP8,
      ScoreEventType.GROUP_ACTIVITY,
    ]);
    if (rankTypes.has(dto.type) && !Number.isInteger(dto.rank)) {
      throw new BusinessException('INVALID_SCORE_EVENT_RANK', '名次不能为空');
    }
    const maxRank =
      dto.type === ScoreEventType.EXAM_GRADE_TOP10
        ? 10
        : dto.type === ScoreEventType.SPORTS_FINAL_TOP8
          ? 8
          : dto.type === ScoreEventType.NOISIEST_CLASS_TOP3 ||
              dto.type === ScoreEventType.SUBJECT_TOP3
            ? 3
            : 3;
    if (rankTypes.has(dto.type) && (dto.rank! < 1 || dto.rank! > maxRank)) {
      throw new BusinessException('INVALID_SCORE_EVENT_RANK', `名次必须在 1-${maxRank} 之间`);
    }
    if (
      manualEventTypes.has(dto.type) &&
      (!Number.isInteger(dto.manualDelta) || dto.manualDelta === 0)
    ) {
      throw new BusinessException('INVALID_SCORE_EVENT_VALUE', '教师最终分值必须为非 0 整数');
    }
    if (manualEventTypes.has(dto.type) && (!dto.reason || dto.reason.trim().length === 0)) {
      throw new BusinessException('INVALID_SCORE_EVENT_REASON', '人工登记事件需要填写原因');
    }
    if (
      dto.type === ScoreEventType.GROUP_ACTIVITY &&
      !dto.isOrganizer &&
      !dto.specialContribution &&
      !dto.rank
    ) {
      throw new BusinessException('INVALID_SCORE_EVENT_VALUE', '团体活动需要填写名次或角色');
    }
  }

  private async calculateDeltas(
    tx: Prisma.TransactionClient,
    classId: string,
    periodId: string,
    occurredAt: Date,
    dto: CreateScoreEventDto,
  ): Promise<number[]> {
    switch (dto.type) {
      case ScoreEventType.LATE:
        return dto.studentIds.map(() => -dto.minutesLate!);
      case ScoreEventType.SCHOOL_UNIFORM:
        return dto.studentIds.map(() => -1);
      case ScoreEventType.EVENING_SELF_STUDY_CALLOUT: {
        const events = await tx.scoreEvent.findMany({
          where: { classId, periodId, type: ScoreEventType.EVENING_SELF_STUDY_CALLOUT },
          select: { occurredAt: true, participants: { select: { studentId: true } } },
        });
        return dto.studentIds.map((studentId) => {
          const sameDayCount =
            events.filter(
              (event) =>
                getTaipeiDateKey(event.occurredAt) === getTaipeiDateKey(occurredAt) &&
                event.participants.some((participant) => participant.studentId === studentId),
            ).length + 1;
          return -(2 ** sameDayCount);
        });
      }
      case ScoreEventType.NOISIEST_CLASS_TOP3:
        return dto.studentIds.map(() => (dto.rank === 1 ? -10 : dto.rank === 2 ? -8 : -6));
      case ScoreEventType.EXAM_GRADE_TOP10:
        return dto.studentIds.map(() => fixedRankDelta(dto.rank!, 10, 10));
      case ScoreEventType.SUBJECT_TOP3:
        return dto.studentIds.map(() => fixedRankDelta(dto.rank!, 3, 3));
      case ScoreEventType.BLACKBOARD:
      case ScoreEventType.INDIVIDUAL_ACTIVITY:
        return dto.studentIds.map(() => (dto.rank === 1 ? 10 : dto.rank === 2 ? 6 : 0));
      case ScoreEventType.SPORTS_FINAL_TOP8:
        return dto.studentIds.map(() => fixedRankDelta(dto.rank!, 8, 10));
      case ScoreEventType.GROUP_ACTIVITY: {
        const award = dto.rank === 1 ? 10 : dto.rank === 2 ? 6 : 0;
        const extra = (dto.isOrganizer ? 4 : 0) + (dto.specialContribution ? 3 : 0);
        return dto.studentIds.map(() => award + extra);
      }
      case ScoreEventType.ACTIVITY_NEGATIVE:
        return dto.studentIds.map(() => -10);
      case ScoreEventType.COMMITTEE_TASK_COMPLETED:
        return dto.studentIds.map(() => 0);
      case ScoreEventType.HOMEWORK_MISSING:
      case ScoreEventType.HOMEWORK_PRAISE:
      case ScoreEventType.BREAKTHROUGH:
      case ScoreEventType.PROGRESS:
      case ScoreEventType.DUTY_HYGIENE:
      case ScoreEventType.DORM_HYGIENE:
      case ScoreEventType.MANUAL:
        return dto.studentIds.map(() => dto.manualDelta!);
      default:
        return dto.studentIds.map(() => 0);
    }
  }

  private isViolation(type: ScoreEventType, delta: number): boolean {
    const violationTypes: ScoreEventType[] = [
      ScoreEventType.LATE,
      ScoreEventType.SCHOOL_UNIFORM,
      ScoreEventType.EVENING_SELF_STUDY_CALLOUT,
      ScoreEventType.NOISIEST_CLASS_TOP3,
      ScoreEventType.ACTIVITY_NEGATIVE,
    ];
    if (violationTypes.includes(type)) return true;
    const manualViolationTypes: ScoreEventType[] = [
      ScoreEventType.HOMEWORK_MISSING,
      ScoreEventType.DUTY_HYGIENE,
      ScoreEventType.DORM_HYGIENE,
    ];
    return manualViolationTypes.includes(type) && delta < 0;
  }

  private toResponse(event: EventWithResults) {
    return {
      id: event.id,
      type: event.type,
      periodId: event.periodId,
      occurredAt: event.occurredAt,
      studentIds: event.participants.map((participant) => participant.studentId),
      records: event.scoreRecords.map((record) => ({
        studentId: record.studentId,
        delta: record.delta,
      })),
    };
  }
}
