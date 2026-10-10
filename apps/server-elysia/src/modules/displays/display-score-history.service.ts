import { ScoreRecordType, StudentStatus, type PrismaClient } from '@prisma/client';
import { config } from '../../config';
import { prisma } from '../../plugins/prisma';
import {
  getTaipeiMonthPeriod,
  SCORE_INITIAL_VALUE,
  scorePeriodsService,
} from '../scores/score-periods.service';

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type StudentRow = { id: string; name: string };
type PeriodRow = {
  id: string;
  startAt: Date;
  endAt: Date;
  initialScore: number;
};
type RecordRow = {
  id: string;
  studentId: string;
  periodId: string | null;
  delta: number;
  reason: string | null;
  recordType?: ScoreRecordType;
  revertedRecordId?: string | null;
  occurredAt: Date | null;
  createdAt: Date;
};

export interface DisplayScoreTimelinePeriod {
  id: string | null;
  startAt: number;
  endAt: number;
  initialScore: number;
}

export interface DisplayScoreTimelineRecord {
  id: string;
  periodId: string | null;
  at: number;
  score: number;
  delta: number;
  reason: string;
}

export interface DisplayScoreTimeline {
  classId: string;
  asOf: number;
  termStartAt: number | null;
  termEndAt: number | null;
  periods: DisplayScoreTimelinePeriod[];
  students: Array<{
    id: string;
    name: string;
    currentScore: number;
    initialAt: number;
    initialScore: number;
    records: DisplayScoreTimelineRecord[];
  }>;
  classAverage: Array<{ at: number; score: number }>;
}

function taipeiDayStart(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day) - TAIPEI_OFFSET_MS;
}

export function configuredTaipeiTerm(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return { termStartAt: null, termEndAt: null };
  return {
    termStartAt: taipeiDayStart(startDate),
    termEndAt: taipeiDayStart(endDate) + DAY_MS,
  };
}

function taipeiMonthRange(at: number): { startAt: number; endAt: number } {
  const period = getTaipeiMonthPeriod(new Date(at));
  return {
    startAt: period.startAt.getTime(),
    endAt: period.endAt.getTime(),
  };
}

function nextTaipeiMonthStart(startAt: number): number {
  return getTaipeiMonthPeriod(new Date(startAt + DAY_MS)).endAt.getTime();
}

function average(scores: Map<string, number>): number {
  if (!scores.size) return 0;
  let total = 0;
  for (const score of scores.values()) total += score;
  return total / scores.size;
}

function recordTime(record: RecordRow): number {
  return (record.occurredAt ?? record.createdAt).getTime();
}

function replayTime(record: RecordRow, recordsById: Map<string, RecordRow>): number {
  if (record.recordType === ScoreRecordType.REVERT && record.revertedRecordId) {
    const revertedRecord = recordsById.get(record.revertedRecordId);
    if (revertedRecord) return recordTime(revertedRecord);
  }
  return recordTime(record);
}

export function buildDisplayScoreTimeline(input: {
  classId: string;
  asOf: Date;
  termStartDate: string | null;
  termEndDate: string | null;
  students: StudentRow[];
  periods: PeriodRow[];
  records: RecordRow[];
}): DisplayScoreTimeline {
  const asOf = input.asOf.getTime();
  const sortedPeriods = [...input.periods]
    .filter((period) => period.startAt.getTime() <= asOf)
    .sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
  const periodsByStart = new Map(sortedPeriods.map((period) => [period.startAt.getTime(), period]));
  const firstStart = sortedPeriods[0]?.startAt.getTime();
  const monthPeriods: DisplayScoreTimelinePeriod[] = [];

  if (firstStart !== undefined) {
    let startAt = taipeiMonthRange(firstStart).startAt;
    while (startAt <= asOf) {
      const endAt = nextTaipeiMonthStart(startAt);
      const persisted = periodsByStart.get(startAt);
      monthPeriods.push({
        id: persisted?.id ?? null,
        startAt: persisted?.startAt.getTime() ?? startAt,
        endAt: persisted?.endAt.getTime() ?? endAt,
        initialScore: persisted?.initialScore ?? SCORE_INITIAL_VALUE,
      });
      startAt = endAt;
    }
  }

  const activeIds = new Set(input.students.map((student) => student.id));
  const periodById = new Map(
    monthPeriods.flatMap((period) => (period.id ? [[period.id, period] as const] : [])),
  );
  const scoreByStudent = new Map<string, number>();
  const studentData = input.students.map((student) => ({
    ...student,
    currentScore: monthPeriods[0]?.initialScore ?? SCORE_INITIAL_VALUE,
    initialAt: monthPeriods[0]?.startAt ?? asOf,
    initialScore: monthPeriods[0]?.initialScore ?? SCORE_INITIAL_VALUE,
    records: [] as DisplayScoreTimelineRecord[],
  }));
  const studentById = new Map(studentData.map((student) => [student.id, student]));
  const recordGroups = new Map<string, RecordRow[]>();
  const recordsById = new Map(input.records.map((record) => [record.id, record] as const));
  for (const record of input.records) {
    if (!activeIds.has(record.studentId)) continue;
    const period = record.periodId ? periodById.get(record.periodId) : undefined;
    if (!period) continue;
    if (recordTime(record) > asOf) continue;
    const at = replayTime(record, recordsById);
    if (at > asOf || at < period.startAt || at >= period.endAt) continue;
    const key = String(period.startAt);
    const group = recordGroups.get(key) ?? [];
    group.push(record);
    recordGroups.set(key, group);
  }

  const classAverage: Array<{ at: number; score: number }> = [];
  for (const period of monthPeriods) {
    for (const student of input.students) scoreByStudent.set(student.id, period.initialScore);
    if (input.students.length) {
      classAverage.push({ at: period.startAt, score: average(scoreByStudent) });
    }

    const records = (recordGroups.get(String(period.startAt)) ?? []).sort(
      (left, right) =>
        replayTime(left, recordsById) - replayTime(right, recordsById) ||
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id),
    );
    let cursor = 0;
    while (cursor < records.length) {
      const at = replayTime(records[cursor], recordsById);
      while (cursor < records.length && replayTime(records[cursor], recordsById) === at) {
        const record = records[cursor];
        const score = (scoreByStudent.get(record.studentId) ?? period.initialScore) + record.delta;
        scoreByStudent.set(record.studentId, score);
        studentById.get(record.studentId)?.records.push({
          id: record.id,
          periodId: record.periodId,
          at,
          score,
          delta: record.delta,
          reason:
            record.reason ?? (record.recordType === ScoreRecordType.REVERT ? '撤销积分记录' : ''),
        });
        cursor += 1;
      }
      if (input.students.length) classAverage.push({ at, score: average(scoreByStudent) });
    }
  }

  for (const student of studentData) {
    student.currentScore = scoreByStudent.get(student.id) ?? student.initialScore;
  }

  const term = configuredTaipeiTerm(input.termStartDate, input.termEndDate);
  return {
    classId: input.classId,
    asOf,
    ...term,
    periods: monthPeriods,
    students: studentData,
    classAverage,
  };
}

export class DisplayScoreHistoryService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getTimeline(classId: string, reference = new Date()): Promise<DisplayScoreTimeline> {
    await scorePeriodsService.ensurePeriodForDate(classId, reference);
    const data = await this.db.$transaction(async (tx) => {
      const students = await tx.student.findMany({
        where: { classId, status: StudentStatus.ACTIVE, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      });
      const periods = await tx.scorePeriod.findMany({
        where: { classId, startAt: { lte: reference } },
        select: { id: true, startAt: true, endAt: true, initialScore: true },
        orderBy: { startAt: 'asc' },
      });
      const periodIds = periods.map((period) => period.id);
      const records =
        periodIds.length && students.length
          ? await tx.scoreRecord.findMany({
              where: {
                classId,
                periodId: { in: periodIds },
                studentId: { in: students.map((student) => student.id) },
              },
              select: {
                id: true,
                studentId: true,
                periodId: true,
                delta: true,
                reason: true,
                recordType: true,
                revertedRecordId: true,
                occurredAt: true,
                createdAt: true,
              },
            })
          : [];
      return { students, periods, records };
    });

    return buildDisplayScoreTimeline({
      classId,
      asOf: reference,
      termStartDate: config.scoreTrendTermStartDate,
      termEndDate: config.scoreTrendTermEndDate,
      ...data,
    });
  }
}

export const displayScoreHistoryService = new DisplayScoreHistoryService();
