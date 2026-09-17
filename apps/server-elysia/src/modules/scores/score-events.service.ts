import { randomUUID } from 'node:crypto';
import {
  type Prisma,
  RelationStatus,
  ScoreEventType,
  ScoreRecordType,
  TeacherRole,
} from '@prisma/client';
import { prisma } from '../../plugins/prisma';
import { BusinessError } from '../../plugins/error-handler';
import { ClassEventType } from '../realtime/realtime.types';
import { realtimeService } from '../realtime/realtime.service';
import { scorePeriodsService } from './score-periods.service';

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

export interface CreateScoreEventInput {
  type: ScoreEventType;
  studentIds: string[];
  occurredAt?: string;
  minutesLate?: number;
  rank?: number;
  manualDelta?: number;
  isOrganizer?: boolean;
  specialContribution?: boolean;
  subject?: string;
  reason?: string;
  businessKey?: string;
}

function getTaipeiDateKey(reference: Date): string {
  const taipeiDate = new Date(reference.getTime() + 8 * 60 * 60 * 1000);
  return `${taipeiDate.getUTCFullYear()}-${String(taipeiDate.getUTCMonth() + 1).padStart(2, '0')}-${String(taipeiDate.getUTCDate()).padStart(2, '0')}`;
}

function fixedRankDelta(rank: number, maxRank: number, firstDelta: number): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > maxRank) return 0;
  return firstDelta - (rank - 1);
}

export class ScoreEventsService {
  async create(classId: string, operatorId: string, dto: CreateScoreEventInput) {
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BusinessError('INVALID_SCORE_EVENT_DATE', '事件发生时间无效');
    }
    this.validateEventInput(dto);

    const access = await prisma.classTeacher.findFirst({
      where: {
        classId,
        teacherId: operatorId,
        status: RelationStatus.ACTIVE,
        role: { in: [TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER] },
      },
      select: { teacherId: true },
    });
    if (!access)
      throw new BusinessError('FORBIDDEN_CLASS_ACCESS', '当前教师在该班级没有有效关系', 403);

    await scorePeriodsService.ensureCurrentPeriod(classId, operatorId);
    const period = await scorePeriodsService.ensurePeriodForDate(classId, occurredAt);
    const result = await prisma.$transaction(async (tx) => {
      const operator = await tx.classTeacher.findFirst({
        where: {
          classId,
          teacherId: operatorId,
          status: RelationStatus.ACTIVE,
          role: { in: [TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER] },
        },
        select: { teacherId: true, subject: true },
      });
      if (!operator)
        throw new BusinessError('FORBIDDEN_CLASS_ACCESS', '当前教师在该班级没有有效关系', 403);

      if (dto.businessKey) {
        const existing = await tx.scoreEvent.findUnique({
          where: { businessKey: dto.businessKey },
          include: eventInclude,
        });
        if (existing) {
          if (existing.classId !== classId)
            throw new BusinessError(
              'SCORE_EVENT_BUSINESS_KEY_CONFLICT',
              '事件业务键已被其他班级使用',
              409,
            );
          return existing;
        }
      }

      const students = await tx.student.findMany({
        where: { classId, id: { in: dto.studentIds }, status: 'ACTIVE' },
        select: { id: true },
      });
      if (students.length !== dto.studentIds.length)
        throw new BusinessError('STUDENT_NOT_FOUND', '事件学生必须是本班在班学生', 404);

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
        .map((studentId, index) => ({ studentId, delta: deltas[index]! }))
        .filter((item) => item.delta !== 0);
      if (recordData.length > 0) {
        await tx.scoreRecord.createMany({
          data: recordData.map((item) => ({
            classId,
            studentId: item.studentId,
            operatorId,
            subject: dto.subject?.trim() || operator.subject,
            periodId: period.id,
            eventId: event.id,
            delta: item.delta,
            reason,
            recordType: ScoreRecordType.NORMAL,
            occurredAt,
            violation: this.isViolation(dto.type, item.delta),
          })),
        });
      }
      return tx.scoreEvent.findUniqueOrThrow({ where: { id: event.id }, include: eventInclude });
    });

    if (result.scoreRecords.length > 0) {
      const occurredAtIso = new Date().toISOString();
      for (const record of result.scoreRecords) {
        realtimeService.publishClassEvent(classId, {
          id: randomUUID(),
          type: ClassEventType.SCORE_CHANGED,
          classId,
          occurredAt: occurredAtIso,
          payload: {
            studentId: record.studentId,
            direction: record.delta > 0 ? 'INCREASE' : 'DECREASE',
            delta: record.delta,
          },
        });
      }
      realtimeService.publishClassEvent(classId, {
        id: randomUUID(),
        type: ClassEventType.RANKING_CHANGED,
        classId,
        occurredAt: occurredAtIso,
        payload: { period: 'MONTH' },
      });
    }
    return this.toResponse(result);
  }

  private validateEventInput(dto: CreateScoreEventInput): void {
    if (systemEventTypes.has(dto.type))
      throw new BusinessError('SCORE_EVENT_SYSTEM_ONLY', '该事件由周期结算生成');
    if (
      dto.type === ScoreEventType.LATE &&
      (!Number.isInteger(dto.minutesLate) || dto.minutesLate! < 1)
    ) {
      throw new BusinessError('INVALID_SCORE_EVENT_VALUE', '迟到分钟数必须为正整数');
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
    if (rankTypes.has(dto.type) && !Number.isInteger(dto.rank))
      throw new BusinessError('INVALID_SCORE_EVENT_RANK', '名次不能为空');
    const maxRank =
      dto.type === ScoreEventType.EXAM_GRADE_TOP10
        ? 10
        : dto.type === ScoreEventType.SPORTS_FINAL_TOP8
          ? 8
          : 3;
    if (rankTypes.has(dto.type) && (dto.rank! < 1 || dto.rank! > maxRank))
      throw new BusinessError('INVALID_SCORE_EVENT_RANK', `名次必须在 1-${maxRank} 之间`);
    if (
      manualEventTypes.has(dto.type) &&
      (!Number.isInteger(dto.manualDelta) || dto.manualDelta === 0)
    )
      throw new BusinessError('INVALID_SCORE_EVENT_VALUE', '教师最终分值必须为非 0 整数');
    if (manualEventTypes.has(dto.type) && (!dto.reason || dto.reason.trim().length === 0))
      throw new BusinessError('INVALID_SCORE_EVENT_REASON', '人工登记事件需要填写原因');
    if (
      dto.type === ScoreEventType.GROUP_ACTIVITY &&
      !dto.isOrganizer &&
      !dto.specialContribution &&
      !dto.rank
    )
      throw new BusinessError('INVALID_SCORE_EVENT_VALUE', '团体活动需要填写名次或角色');
  }

  private async calculateDeltas(
    tx: Prisma.TransactionClient,
    classId: string,
    periodId: string,
    occurredAt: Date,
    dto: CreateScoreEventInput,
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
    if (
      (
        [
          ScoreEventType.LATE,
          ScoreEventType.SCHOOL_UNIFORM,
          ScoreEventType.EVENING_SELF_STUDY_CALLOUT,
          ScoreEventType.NOISIEST_CLASS_TOP3,
          ScoreEventType.ACTIVITY_NEGATIVE,
        ] as ScoreEventType[]
      ).includes(type)
    )
      return true;
    return (
      (
        [
          ScoreEventType.HOMEWORK_MISSING,
          ScoreEventType.DUTY_HYGIENE,
          ScoreEventType.DORM_HYGIENE,
        ] as ScoreEventType[]
      ).includes(type) && delta < 0
    );
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

export const scoreEventsService = new ScoreEventsService();
