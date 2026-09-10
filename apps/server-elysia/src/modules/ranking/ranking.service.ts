import { StudentStatus } from '@prisma/client';
import { prisma } from '../../plugins/prisma';

export const RANKING_PERIOD_TYPE = 'WEEK' as const;
export const WEEK_OVER_WEEK_STRATEGY = 'WEEK_OVER_WEEK_RANK_CHANGE' as const;

export interface RankingPeriod {
  type: typeof RANKING_PERIOD_TYPE;
  startAt: Date;
  endAt: Date;
}

export interface RankedStudent {
  studentId: string;
  name: string;
  rank: number;
  score: number;
}

export interface ProgressItem {
  studentId: string;
  name: string;
  previousRank: number;
  currentRank: number;
  change: number;
}

export function getUtcWeekPeriod(reference = new Date()): RankingPeriod {
  const startAt = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()),
  );
  const daysSinceMonday = (startAt.getUTCDay() + 6) % 7;
  startAt.setUTCDate(startAt.getUTCDate() - daysSinceMonday);
  const endAt = new Date(startAt);
  endAt.setUTCDate(endAt.getUTCDate() + 7);
  return { type: RANKING_PERIOD_TYPE, startAt, endAt };
}

export function previousPeriod(period: RankingPeriod): RankingPeriod {
  const durationMs = period.endAt.getTime() - period.startAt.getTime();
  return {
    type: RANKING_PERIOD_TYPE,
    startAt: new Date(period.startAt.getTime() - durationMs),
    endAt: new Date(period.startAt),
  };
}

export function rankStudentTotals(
  students: Array<{ studentId: string; name: string; score: number }>,
): RankedStudent[] {
  const sorted = [...students].sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    return left.studentId < right.studentId ? -1 : left.studentId > right.studentId ? 1 : 0;
  });

  let previousScore: number | undefined;
  let previousRank = 0;
  return sorted.map((student, index) => {
    const rank = previousScore === student.score ? previousRank : index + 1;
    previousScore = student.score;
    previousRank = rank;
    return { ...student, rank };
  });
}

export class RankingService {
  async getRanking(classId: string, startAt: Date, endAt: Date): Promise<RankedStudent[]> {
    const students = await prisma.student.findMany({
      where: { classId, status: StudentStatus.ACTIVE, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    if (students.length === 0) return [];

    const totals = await prisma.scoreRecord.groupBy({
      by: ['studentId'],
      where: {
        classId,
        studentId: { in: students.map((s) => s.id) },
        createdAt: { gte: startAt, lt: endAt },
      },
      _sum: { delta: true },
    });

    const totalByStudentId = new Map(totals.map((t) => [t.studentId, t._sum.delta ?? 0]));

    return rankStudentTotals(
      students.map((s) => ({
        studentId: s.id,
        name: s.name,
        score: totalByStudentId.get(s.id) ?? 0,
      })),
    );
  }

  async getProgressRanking(classId: string, period: RankingPeriod): Promise<ProgressItem[]> {
    const prev = previousPeriod(period);
    const [currentRanking, previousRanking] = await Promise.all([
      this.getRanking(classId, period.startAt, period.endAt),
      this.getRanking(classId, prev.startAt, prev.endAt),
    ]);

    const previousByStudentId = new Map(previousRanking.map((s) => [s.studentId, s.rank]));

    return currentRanking
      .map((student): ProgressItem | null => {
        const previousRank = previousByStudentId.get(student.studentId);
        if (previousRank === undefined) return null;
        const change = previousRank - student.rank;
        if (change <= 0) return null;
        return {
          studentId: student.studentId,
          name: student.name,
          previousRank,
          currentRank: student.rank,
          change,
        };
      })
      .filter((item): item is ProgressItem => item !== null)
      .sort((left, right) => {
        if (left.change !== right.change) return right.change - left.change;
        if (left.currentRank !== right.currentRank) return left.currentRank - right.currentRank;
        return left.studentId < right.studentId ? -1 : left.studentId > right.studentId ? 1 : 0;
      });
  }

  async getWeeklyRanking(classId: string, reference = new Date()) {
    const period = getUtcWeekPeriod(reference);
    const [currentRanking, progress] = await Promise.all([
      this.getRanking(classId, period.startAt, period.endAt),
      this.getProgressRanking(classId, period),
    ]);

    return {
      period: {
        type: period.type,
        startAt: period.startAt.toISOString(),
        endAt: period.endAt.toISOString(),
      },
      top3: currentRanking.slice(0, 3).map(({ studentId, name, rank }) => ({
        studentId,
        name,
        rank,
      })),
      progress,
      strategy: WEEK_OVER_WEEK_STRATEGY,
    };
  }
}

export const rankingService = new RankingService();
