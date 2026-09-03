import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  RelationStatus,
  ScoreEventType,
  ScorePeriodStatus,
  ScoreRecordType,
  StudentStatus,
  TeacherRole,
} from '@prisma/client';
import { BusinessException, ClassEventType } from '../common';
import { PrismaService } from '../prisma';
import { RealtimeService } from '../realtime/realtime.service';
import {
  getTaipeiMonthPeriod,
  roleBonus,
  SCORE_INITIAL_VALUE,
} from './score-event.types';

const periodSelect = {
  id: true,
  startAt: true,
  endAt: true,
  initialScore: true,
  status: true,
  settledAt: true,
} satisfies Prisma.ScorePeriodSelect;

type PeriodRow = Prisma.ScorePeriodGetPayload<{ select: typeof periodSelect }>;

export interface RankedPeriodStudent {
  studentId: string;
  name: string;
  score: number;
  rank: number;
}

@Injectable()
export class ScorePeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async ensureCurrentPeriod(classId: string, operatorId?: string, reference = new Date()): Promise<PeriodRow> {
    await this.backfillLegacyRecords(classId);
    const current = await this.getOrCreatePeriod(classId, getTaipeiMonthPeriod(reference));
    const previous = await this.prisma.scorePeriod.findMany({
      where: {
        classId,
        status: ScorePeriodStatus.OPEN,
        endAt: { lte: current.startAt },
      },
      orderBy: { startAt: 'asc' },
      select: periodSelect,
    });

    for (const period of previous) {
      await this.settlePeriod(classId, period.id, operatorId);
    }
    return current;
  }

  async ensurePeriodForDate(classId: string, reference: Date): Promise<PeriodRow> {
    await this.backfillLegacyRecords(classId);
    return this.getOrCreatePeriod(classId, getTaipeiMonthPeriod(reference));
  }

  async getCurrentSummary(classId: string, operatorId: string, reference = new Date()) {
    const period = await this.ensureCurrentPeriod(classId, operatorId, reference);
    return this.buildSummary(classId, [period], period);
  }

  async getSummary(
    classId: string,
    operatorId: string,
    from?: string,
    to?: string,
    reference = new Date(),
  ) {
    const current = await this.ensureCurrentPeriod(classId, operatorId, reference);
    if (!from && !to) return this.buildSummary(classId, [current], current);

    const range = this.parseRange(from, to);
    const periods = await this.prisma.scorePeriod.findMany({
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

  async settleBeforeCurrent(classId: string, operatorId: string, reference = new Date()): Promise<void> {
    const current = await this.ensureCurrentPeriod(classId, operatorId, reference);
    const openPeriods = await this.prisma.scorePeriod.findMany({
      where: { classId, status: ScorePeriodStatus.OPEN, endAt: { lte: current.startAt } },
      orderBy: { startAt: 'asc' },
      select: periodSelect,
    });
    for (const period of openPeriods) await this.settlePeriod(classId, period.id, operatorId);
  }

  async settlePeriod(classId: string, periodId: string, requestedOperatorId?: string): Promise<PeriodRow> {
    const result = await this.prisma.$transaction(async (tx) => {
      const period = await tx.scorePeriod.findFirst({
        where: { id: periodId, classId },
        select: periodSelect,
      });
      if (!period) {
        throw new BusinessException('SCORE_PERIOD_NOT_FOUND', '积分周期不存在', HttpStatus.NOT_FOUND);
      }
      if (period.status === ScorePeriodStatus.SETTLED) return { period, deltas: [] as number[] };

      const operator = await this.findSettlementOperator(tx, classId, requestedOperatorId);
      if (!operator) {
        throw new BusinessException('FORBIDDEN_CLASS_ACCESS', '当前教师在该班级没有有效关系', HttpStatus.FORBIDDEN);
      }

      const students = await tx.student.findMany({
        where: { classId, status: StudentStatus.ACTIVE },
        select: { id: true },
      });
      const violations = await tx.scoreRecord.findMany({
        where: { classId, periodId, recordType: ScoreRecordType.NORMAL, violation: true },
        select: { studentId: true, reversion: { select: { id: true } } },
      });
      const violationStudentIds = new Set(
        violations.filter((record) => record.reversion === null).map((record) => record.studentId),
      );
      const noViolationStudents = students.filter((student) => !violationStudentIds.has(student.id));
      const eventAt = new Date(period.endAt.getTime() - 1);
      const deltas: number[] = [];

      const noViolationKey = `score-period:${period.id}:no-violation`;
      const existingNoViolation = await tx.scoreEvent.findUnique({ where: { businessKey: noViolationKey } });
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
            parameters: JSON.stringify({ delta: 10 }),
          },
        });
        await tx.scoreEventParticipant.createMany({
          data: noViolationStudents.map((student) => ({ eventId: event.id, studentId: student.id })),
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
          status: RelationStatus.ACTIVE,
          termStartAt: { lt: period.endAt },
          OR: [{ termEndAt: null }, { termEndAt: { gt: period.startAt } }],
        },
        select: {
          studentId: true,
          role: true,
          trialEndsAt: true,
        },
      });
      const taskEvents = await tx.scoreEvent.findMany({
        where: { classId, periodId: period.id, type: ScoreEventType.COMMITTEE_TASK_COMPLETED },
        select: { participants: { select: { studentId: true } } },
      });
      const taskStudents = new Set(taskEvents.flatMap((event) => event.participants.map((item) => item.studentId)));
      const committeeRewards = assignments
        .filter((assignment) => assignment.trialEndsAt === null || assignment.trialEndsAt <= period.endAt)
        .map((assignment) => ({
          studentId: assignment.studentId,
          delta: assignment.role === '团支书' && !taskStudents.has(assignment.studentId)
            ? 0
            : roleBonus(assignment.role),
          role: assignment.role,
        }))
        .filter((assignment) => assignment.delta !== 0);

      const committeeKey = `score-period:${period.id}:committee`;
      const existingCommittee = await tx.scoreEvent.findUnique({ where: { businessKey: committeeKey } });
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
            parameters: JSON.stringify({ rewards: committeeRewards }),
          },
        });
        await tx.scoreEventParticipant.createMany({
          data: committeeRewards.map((assignment) => ({ eventId: event.id, studentId: assignment.studentId })),
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

      const settledAt = new Date();
      const settled = await tx.scorePeriod.update({
        where: { id: period.id },
        data: { status: ScorePeriodStatus.SETTLED, settledAt },
        select: periodSelect,
      });
      return { period: settled, deltas };
    });

    if (result.deltas.length > 0) {
      await this.publishSettlement(classId, result.deltas.length);
    }
    return result.period;
  }

  private async getOrCreatePeriod(classId: string, boundary: { startAt: Date; endAt: Date }): Promise<PeriodRow> {
    return this.prisma.scorePeriod.upsert({
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

  private async backfillLegacyRecords(classId: string): Promise<void> {
    const legacyRecords = await this.prisma.scoreRecord.findMany({
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
      await this.prisma.scoreRecord.updateMany({
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
    const activeStudents = await this.prisma.student.findMany({
      where: { classId, status: StudentStatus.ACTIVE },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    const periodIds = periods.map((period) => period.id);
    const records = periodIds.length === 0
      ? []
      : await this.prisma.scoreRecord.findMany({
          where: { classId, periodId: { in: periodIds } },
          select: { studentId: true, delta: true },
        });
    const deltaByStudent = new Map<string, number>();
    for (const record of records) deltaByStudent.set(record.studentId, (deltaByStudent.get(record.studentId) ?? 0) + record.delta);
    const baseScore = periods.reduce((total, period) => total + period.initialScore, 0);
    const ranked = this.rank(activeStudents.map((student) => ({
      studentId: student.id,
      name: student.name,
      score: baseScore + (deltaByStudent.get(student.id) ?? 0),
    })));
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
    const sorted = [...students].sort((left, right) =>
      right.score - left.score || left.studentId.localeCompare(right.studentId),
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

  private parseRange(from?: string, to?: string): { startAt: Date; endAt: Date } {
    const startAt = from ? new Date(from) : new Date('1970-01-01T00:00:00.000Z');
    const endAt = to ? new Date(to) : new Date('2999-12-31T23:59:59.999Z');
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || startAt >= endAt) {
      throw new BusinessException('INVALID_SCORE_PERIOD_RANGE', '积分周期范围无效');
    }
    return { startAt, endAt };
  }

  private async findSettlementOperator(
    tx: Prisma.TransactionClient,
    classId: string,
    requestedOperatorId?: string,
  ) {
    const where: Prisma.ClassTeacherWhereInput = {
      classId,
      ...(requestedOperatorId ? { teacherId: requestedOperatorId } : {}),
      status: RelationStatus.ACTIVE,
      role: requestedOperatorId
        ? { in: [TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER] }
        : TeacherRole.HEAD_TEACHER,
    };
    return tx.classTeacher.findFirst({
      where,
      select: { teacherId: true, subject: true },
    });
  }

  private async publishSettlement(classId: string, recordCount: number): Promise<void> {
    const events: Array<{
      id: string;
      type: ClassEventType;
      classId: string;
      occurredAt: string;
      payload: unknown;
    }> = Array.from({ length: Math.min(recordCount, 50) }, () => ({
      id: randomUUID(),
      type: ClassEventType.SCORE_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: { direction: 'INCREASE' as const },
    }));
    events.push({
      id: randomUUID(),
      type: ClassEventType.RANKING_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: { period: 'MONTH' as const },
    });
    await Promise.allSettled(events.map((event) => Promise.resolve(this.realtime.publishClassEvent(classId, event))));
  }
}
