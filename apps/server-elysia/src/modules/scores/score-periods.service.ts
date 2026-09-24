import { randomUUID } from 'node:crypto';
import {
  type Prisma,
  type PrismaClient,
  RelationStatus,
  ScoreEventType,
  ScorePeriodStatus,
  ScoreRecordType,
  StudentStatus,
  TeacherRole,
} from '@prisma/client';
import { prisma } from '../../plugins/prisma';
import { BusinessError } from '../../plugins/error-handler';
import { ClassEventType } from '../realtime/realtime.types';
import { realtimeService } from '../realtime/realtime.service';

const periodSelect = {
  id: true,
  startAt: true,
  endAt: true,
  initialScore: true,
  status: true,
  settledAt: true,
} satisfies Prisma.ScorePeriodSelect;

type PeriodRow = Prisma.ScorePeriodGetPayload<{ select: typeof periodSelect }>;

const SCORE_INITIAL_VALUE = 100;

function getTaipeiMonthPeriod(reference: Date): { startAt: Date; endAt: Date } {
  if (Number.isNaN(reference.getTime())) throw new Error('Invalid reference date');
  const taipeiDate = new Date(reference.getTime() + 8 * 60 * 60 * 1000);
  const year = taipeiDate.getUTCFullYear();
  const month = taipeiDate.getUTCMonth();
  return {
    startAt: new Date(Date.UTC(year, month, 1) - 8 * 60 * 60 * 1000),
    endAt: new Date(Date.UTC(year, month + 1, 1) - 8 * 60 * 60 * 1000),
  };
}

function roleBonus(role: string): number {
  const normalized = role.trim();
  if (['班长', '团支书', '劳动委员', '纪律委员'].includes(normalized)) return 10;
  if (['学习委员', '课代表', '网管'].includes(normalized)) return 4;
  if (normalized === '寝室长') return 3;
  return 5;
}

export interface CommitteeAssignmentInput {
  studentId: string;
  role: string;
  subject?: string | null;
  termStartAt: string;
  termEndAt?: string | null;
  trialEndsAt?: string | null;
}

interface NormalizedCommitteeAssignment {
  studentId: string;
  role: string;
  subject: string | null;
  termStartAt: Date;
  termEndAt: Date | null;
  trialEndsAt: Date | null;
}

export interface CommitteeRewardCandidate {
  studentId: string;
  role: string;
  termStartAt: Date;
  termEndAt: Date | null;
  trialEndsAt: Date | null;
  studentStatus: StudentStatus;
  deletedAt: Date | null;
}

function parseCommitteeDate(value: string | null | undefined, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BusinessError('INVALID_COMMITTEE_ASSIGNMENT', `${field}时间无效`, 400);
  }
  return date;
}

function committeeAssignmentKey(assignment: {
  studentId: string;
  role: string;
  termStartAt: Date;
}): string {
  return `${assignment.studentId}\u0000${assignment.role}\u0000${assignment.termStartAt.getTime()}`;
}

function sameNullableDate(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

export function normalizeCommitteeAssignments(
  assignments: CommitteeAssignmentInput[],
): NormalizedCommitteeAssignment[] {
  const normalized: NormalizedCommitteeAssignment[] = [];
  const byKey = new Map<string, NormalizedCommitteeAssignment>();

  for (const assignment of assignments) {
    const role = assignment.role.trim();
    if (!role) throw new BusinessError('INVALID_COMMITTEE_ASSIGNMENT', '班委岗位不能为空', 400);

    const termStartAt = parseCommitteeDate(assignment.termStartAt, '任职开始');
    if (!termStartAt) {
      throw new BusinessError('INVALID_COMMITTEE_ASSIGNMENT', '任职开始时间不能为空', 400);
    }
    const termEndAt = parseCommitteeDate(assignment.termEndAt, '任职结束');
    if (termEndAt !== null && termEndAt <= termStartAt) {
      throw new BusinessError(
        'INVALID_COMMITTEE_ASSIGNMENT',
        '任职结束时间必须晚于任职开始时间',
        400,
      );
    }
    const item: NormalizedCommitteeAssignment = {
      studentId: assignment.studentId,
      role,
      subject: assignment.subject?.trim() || null,
      termStartAt,
      termEndAt,
      trialEndsAt: parseCommitteeDate(assignment.trialEndsAt, '试用结束'),
    };
    const key = committeeAssignmentKey(item);
    const existing = byKey.get(key);
    if (existing) {
      if (
        existing.subject !== item.subject ||
        !sameNullableDate(existing.termEndAt, item.termEndAt) ||
        !sameNullableDate(existing.trialEndsAt, item.trialEndsAt)
      ) {
        throw new BusinessError('INVALID_COMMITTEE_ASSIGNMENT', '同一岗位的任职信息不一致', 400);
      }
      continue;
    }
    byKey.set(key, item);
    normalized.push(item);
  }

  return normalized;
}

export function buildCommitteeRewards(
  assignments: CommitteeRewardCandidate[],
  taskStudentIds: ReadonlySet<string>,
  period: { startAt: Date; endAt: Date },
) {
  const eligibleByRole = new Map<string, CommitteeRewardCandidate>();
  for (const assignment of assignments) {
    if (assignment.studentStatus !== StudentStatus.ACTIVE || assignment.deletedAt !== null)
      continue;
    if (assignment.termStartAt >= period.endAt) continue;
    if (assignment.termEndAt !== null && assignment.termEndAt <= period.startAt) continue;

    const key = `${assignment.studentId}\u0000${assignment.role.trim()}`;
    const current = eligibleByRole.get(key);
    if (!current || assignment.termStartAt > current.termStartAt) {
      eligibleByRole.set(key, assignment);
    }
  }

  return [...eligibleByRole.values()]
    .filter(
      (assignment) => assignment.trialEndsAt === null || assignment.trialEndsAt <= period.endAt,
    )
    .map((assignment) => ({
      studentId: assignment.studentId,
      delta:
        assignment.role.trim() === '团支书' && !taskStudentIds.has(assignment.studentId)
          ? 0
          : roleBonus(assignment.role),
      role: assignment.role.trim(),
    }))
    .filter((assignment) => assignment.delta !== 0)
    .sort(
      (left, right) =>
        left.studentId.localeCompare(right.studentId) || left.role.localeCompare(right.role),
    );
}

export interface RankedPeriodStudent {
  studentId: string;
  name: string;
  score: number;
  rank: number;
}

export class ScorePeriodsService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async ensurePeriodForDate(classId: string, reference: Date) {
    await this.backfillLegacyRecords(classId);
    return this.getOrCreatePeriod(classId, getTaipeiMonthPeriod(reference));
  }

  async getCurrentSummary(classId: string) {
    const period = await this.ensurePeriodForDate(classId, new Date());
    return this.buildSummary(classId, [period], period);
  }

  async getCurrentSummaryForDisplay(classId: string, reference = new Date()) {
    const period = await this.ensurePeriodForDate(classId, reference);
    return this.buildSummary(classId, [period], period);
  }

  async getSummary(classId: string, from?: string, to?: string) {
    const current = await this.ensurePeriodForDate(classId, new Date());
    if (!from && !to) return this.buildSummary(classId, [current], current);

    const range = this.parseRange(from, to);
    const periods = await this.db.scorePeriod.findMany({
      where: {
        classId,
        startAt: { lt: range.endAt },
        endAt: { gt: range.startAt },
      },
      orderBy: { startAt: 'asc' },
      select: periodSelect,
    });
    return this.buildSummary(classId, periods, periods.length === 1 ? periods[0] : null, range);
  }

  async settleAllDuePeriods(now: Date = new Date()): Promise<{
    settled: number;
    skipped: number;
    failed: number;
  }> {
    const dueClasses = await this.db.scorePeriod.findMany({
      where: { status: ScorePeriodStatus.OPEN, endAt: { lte: now } },
      select: { classId: true },
      distinct: ['classId'],
    });
    let settled = 0;
    let skipped = 0;
    let failed = 0;

    for (const { classId } of dueClasses) {
      const headTeacher = await this.db.classTeacher.findFirst({
        where: { classId, status: RelationStatus.ACTIVE, role: TeacherRole.HEAD_TEACHER },
        select: { teacherId: true },
      });
      if (!headTeacher) {
        skipped += 1;
        console.warn(`[score-settlement] skipped class without active head teacher: ${classId}`);
        continue;
      }

      const periods = await this.db.scorePeriod.findMany({
        where: { classId, status: ScorePeriodStatus.OPEN, endAt: { lte: now } },
        orderBy: { startAt: 'asc' },
        select: periodSelect,
      });
      for (const period of periods) {
        try {
          await this.settlePeriod(classId, period.id, headTeacher.teacherId);
          settled += 1;
        } catch (error) {
          failed += 1;
          console.error('[score-settlement] failed period', {
            classId,
            periodId: period.id,
            error,
          });
        }
      }
    }

    return { settled, skipped, failed };
  }

  async settlePeriod(classId: string, periodId: string, requestedOperatorId?: string) {
    const result = await this.db.$transaction(async (tx) => {
      const period = await tx.scorePeriod.findFirst({
        where: { id: periodId, classId },
        select: periodSelect,
      });
      if (!period) throw new BusinessError('SCORE_PERIOD_NOT_FOUND', '积分周期不存在', 404);
      if (period.status === ScorePeriodStatus.SETTLED) return { period, deltas: [] as number[] };

      const operator = await this.findSettlementOperator(tx, classId, requestedOperatorId);
      if (!operator) {
        throw new BusinessError('FORBIDDEN_CLASS_ACCESS', '当前教师在该班级没有有效关系', 403);
      }

      const students = await tx.student.findMany({
        where: { classId, status: StudentStatus.ACTIVE, deletedAt: null },
        select: { id: true },
      });
      const violations = await tx.scoreRecord.findMany({
        where: { classId, periodId, recordType: ScoreRecordType.NORMAL, violation: true },
        select: { studentId: true, reversion: { select: { id: true } } },
      });
      const violationStudentIds = new Set(
        violations.filter((record) => record.reversion === null).map((record) => record.studentId),
      );
      const noViolationStudents = students.filter(
        (student) => !violationStudentIds.has(student.id),
      );
      const eventAt = new Date(period.endAt.getTime() - 1);
      const deltas: number[] = [];

      const noViolationKey = `score-period:${period.id}:no-violation`;
      const existingNoViolation = await tx.scoreEvent.findUnique({
        where: { businessKey: noViolationKey },
      });
      if (!existingNoViolation) {
        const event = await tx.scoreEvent.create({
          data: {
            classId,
            periodId: period.id,
            type: ScoreEventType.NO_VIOLATION_REWARD,
            operatorId: operator.teacherId,
            occurredAt: eventAt,
            reason: '周期无违规奖励',
            businessKey: noViolationKey,
            parameters: JSON.stringify({ delta: 10, sourceSystem: true }),
          },
        });
        await tx.scoreEventParticipant.createMany({
          data: noViolationStudents.map((student) => ({
            eventId: event.id,
            studentId: student.id,
          })),
        });
        await tx.scoreRecord.createMany({
          data: noViolationStudents.map((student) => ({
            classId,
            studentId: student.id,
            operatorId: operator.teacherId,
            subject: operator.subject,
            periodId: period.id,
            eventId: event.id,
            delta: 10,
            reason: '周期无违规奖励',
            recordType: ScoreRecordType.NORMAL,
            occurredAt: eventAt,
            violation: false,
          })),
        });
        deltas.push(...noViolationStudents.map(() => 10));
      }

      const assignments = await tx.classCommitteeAssignment.findMany({
        where: {
          classId,
          termStartAt: { lt: period.endAt },
          OR: [{ termEndAt: null }, { termEndAt: { gt: period.startAt } }],
          student: { status: StudentStatus.ACTIVE, deletedAt: null },
        },
        select: {
          studentId: true,
          role: true,
          termStartAt: true,
          termEndAt: true,
          trialEndsAt: true,
          status: true,
          updatedAt: true,
          student: { select: { status: true, deletedAt: true } },
        },
      });
      const taskEvents = await tx.scoreEvent.findMany({
        where: { classId, periodId: period.id, type: ScoreEventType.COMMITTEE_TASK_COMPLETED },
        select: { participants: { select: { studentId: true } } },
      });
      const taskStudents = new Set(
        taskEvents.flatMap((event) => event.participants.map((item) => item.studentId)),
      );
      const committeeRewards = buildCommitteeRewards(
        assignments.map((assignment) => ({
          studentId: assignment.studentId,
          role: assignment.role,
          termStartAt: assignment.termStartAt,
          termEndAt:
            assignment.termEndAt ??
            (assignment.status === RelationStatus.REVOKED ? assignment.updatedAt : null),
          trialEndsAt: assignment.trialEndsAt,
          studentStatus: assignment.student.status,
          deletedAt: assignment.student.deletedAt,
        })),
        taskStudents,
        period,
      );

      const committeeKey = `score-period:${period.id}:committee`;
      const existingCommittee = await tx.scoreEvent.findUnique({
        where: { businessKey: committeeKey },
      });
      if (!existingCommittee) {
        const event = await tx.scoreEvent.create({
          data: {
            classId,
            periodId: period.id,
            type: ScoreEventType.COMMITTEE_REWARD,
            operatorId: operator.teacherId,
            occurredAt: eventAt,
            reason: '班委周期奖励',
            businessKey: committeeKey,
            parameters: JSON.stringify({ rewards: committeeRewards, sourceSystem: true }),
          },
        });
        await tx.scoreEventParticipant.createMany({
          data: committeeRewards.map((assignment) => ({
            eventId: event.id,
            studentId: assignment.studentId,
          })),
        });
        await tx.scoreRecord.createMany({
          data: committeeRewards.map((assignment) => ({
            classId,
            studentId: assignment.studentId,
            operatorId: operator.teacherId,
            subject: null,
            periodId: period.id,
            eventId: event.id,
            delta: assignment.delta,
            reason: `班委周期奖励：${assignment.role}`,
            recordType: ScoreRecordType.NORMAL,
            occurredAt: eventAt,
            violation: false,
          })),
        });
        deltas.push(...committeeRewards.map((assignment) => assignment.delta));
      }

      const settled = await tx.scorePeriod.update({
        where: { id: period.id },
        data: { status: ScorePeriodStatus.SETTLED, settledAt: new Date() },
        select: periodSelect,
      });
      return { period: settled, deltas };
    });

    if (result.deltas.length > 0) this.publishSettlement(classId, result.deltas.length);
    return result.period;
  }

  private async getOrCreatePeriod(classId: string, boundary: { startAt: Date; endAt: Date }) {
    return this.db.scorePeriod.upsert({
      where: {
        classId_startAt_endAt: { classId, startAt: boundary.startAt, endAt: boundary.endAt },
      },
      update: {},
      create: {
        classId,
        startAt: boundary.startAt,
        endAt: boundary.endAt,
        initialScore: SCORE_INITIAL_VALUE,
      },
      select: periodSelect,
    });
  }

  private async backfillLegacyRecords(classId: string) {
    const legacyRecords = await this.db.scoreRecord.findMany({
      where: { classId, periodId: null },
      select: { id: true, createdAt: true, occurredAt: true },
    });
    const byPeriod = new Map<string, { boundary: { startAt: Date; endAt: Date }; ids: string[] }>();
    for (const record of legacyRecords) {
      const boundary = getTaipeiMonthPeriod(record.occurredAt ?? record.createdAt);
      const key = `${boundary.startAt.toISOString()}|${boundary.endAt.toISOString()}`;
      const existing = byPeriod.get(key);
      if (existing) existing.ids.push(record.id);
      else byPeriod.set(key, { boundary, ids: [record.id] });
    }
    for (const { boundary, ids } of byPeriod.values()) {
      const period = await this.getOrCreatePeriod(classId, boundary);
      await this.db.scoreRecord.updateMany({
        where: { id: { in: ids }, periodId: null },
        data: { periodId: period.id },
      });
    }
  }

  private async buildSummary(
    classId: string,
    periods: PeriodRow[],
    currentPeriod: PeriodRow | null,
    range?: { startAt: Date; endAt: Date },
  ) {
    const activeStudents = await this.db.student.findMany({
      where: { classId, status: StudentStatus.ACTIVE, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    const periodIds = periods.map((period) => period.id);
    const records = periodIds.length
      ? await this.db.scoreRecord.findMany({
          where: { classId, periodId: { in: periodIds } },
          select: { studentId: true, delta: true },
        })
      : [];
    const deltaByStudent = new Map<string, number>();
    for (const record of records)
      deltaByStudent.set(
        record.studentId,
        (deltaByStudent.get(record.studentId) ?? 0) + record.delta,
      );
    const baseScore = periods.reduce((total, period) => total + period.initialScore, 0);
    const ranked = this.rank(
      activeStudents.map((student) => ({
        studentId: student.id,
        name: student.name,
        score: baseScore + (deltaByStudent.get(student.id) ?? 0),
      })),
    );
    const summaryRange = range ?? {
      startAt: periods[0]?.startAt ?? currentPeriod?.startAt ?? new Date(),
      endAt: periods.at(-1)?.endAt ?? currentPeriod?.endAt ?? new Date(),
    };
    return {
      period: currentPeriod ? this.toPeriodView(currentPeriod) : null,
      periods: periods.map((period) => this.toPeriodView(period)),
      range: summaryRange,
      students: ranked,
      top3: ranked.slice(0, 3),
      recommendedSeatOrder: ranked,
    };
  }

  private rank(students: Array<Omit<RankedPeriodStudent, 'rank'>>): RankedPeriodStudent[] {
    const sorted = [...students].sort(
      (left, right) => right.score - left.score || left.studentId.localeCompare(right.studentId),
    );
    let previousScore: number | null = null;
    let previousRank = 0;
    return sorted.map((student, index) => {
      const rank = previousScore === student.score ? previousRank : index + 1;
      previousScore = student.score;
      previousRank = rank;
      return { ...student, rank };
    });
  }

  private toPeriodView(period: PeriodRow) {
    return {
      id: period.id,
      startAt: period.startAt,
      endAt: period.endAt,
      initialScore: period.initialScore,
      status: period.status,
      settledAt: period.settledAt,
    };
  }

  private parseRange(from?: string, to?: string) {
    const startAt = from ? new Date(from) : new Date('1970-01-01T00:00:00.000Z');
    const endAt = to ? new Date(to) : new Date('2999-12-31T23:59:59.999Z');
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || startAt >= endAt) {
      throw new BusinessError('INVALID_SCORE_PERIOD_RANGE', '积分周期范围无效');
    }
    return { startAt, endAt };
  }

  private async findSettlementOperator(
    tx: Prisma.TransactionClient,
    classId: string,
    requestedOperatorId?: string,
  ) {
    return tx.classTeacher.findFirst({
      where: {
        classId,
        ...(requestedOperatorId ? { teacherId: requestedOperatorId } : {}),
        status: RelationStatus.ACTIVE,
        role: requestedOperatorId
          ? { in: [TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER] }
          : TeacherRole.HEAD_TEACHER,
      },
      select: { teacherId: true, subject: true },
    });
  }

  private publishSettlement(classId: string, recordCount: number): void {
    const occurredAt = new Date().toISOString();
    for (let index = 0; index < Math.min(recordCount, 50); index += 1) {
      realtimeService.publishClassEvent(classId, {
        id: randomUUID(),
        type: ClassEventType.SCORE_CHANGED,
        classId,
        occurredAt,
        payload: { direction: 'INCREASE' },
      });
    }
    realtimeService.publishClassEvent(classId, {
      id: randomUUID(),
      type: ClassEventType.RANKING_CHANGED,
      classId,
      occurredAt,
      payload: { period: 'MONTH' },
    });
  }
}

export const scorePeriodsService = new ScorePeriodsService();
