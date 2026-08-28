export const RANKING_PERIOD_TYPE = 'WEEK' as const;
export const WEEK_OVER_WEEK_STRATEGY = 'WEEK_OVER_WEEK_RANK_CHANGE' as const;

export interface RankingPeriod {
  type: typeof RANKING_PERIOD_TYPE;
  startAt: Date;
  /** Exclusive UTC boundary: the following Monday at 00:00:00.000Z. */
  endAt: Date;
}

export interface RankedStudent {
  studentId: string;
  name: string;
  rank: number;
  /** Internal aggregation value. Never expose this field in public ranking DTOs. */
  score: number;
}

export interface ProgressItem {
  studentId: string;
  name: string;
  previousRank: number;
  currentRank: number;
  change: number;
}

export interface RankingStrategy {
  getProgressRanking(classId: string, period: RankingPeriod): Promise<ProgressItem[]>;
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
