import { ScoreEventType } from '@prisma/client';

export { ScoreEventType };

export const SCORE_INITIAL_VALUE = 100;
export const MONTHLY_SCORE_TIME_ZONE = 'Asia/Taipei';

export interface ScorePeriodBoundary {
  startAt: Date;
  endAt: Date;
}

export function getTaipeiMonthPeriod(reference: Date): ScorePeriodBoundary {
  if (Number.isNaN(reference.getTime())) {
    throw new Error('Invalid reference date');
  }

  const taipeiDate = new Date(reference.getTime() + 8 * 60 * 60 * 1000);
  const year = taipeiDate.getUTCFullYear();
  const month = taipeiDate.getUTCMonth();
  return {
    startAt: new Date(Date.UTC(year, month, 1) - 8 * 60 * 60 * 1000),
    endAt: new Date(Date.UTC(year, month + 1, 1) - 8 * 60 * 60 * 1000),
  };
}

export function getTaipeiDateKey(reference: Date): string {
  const taipeiDate = new Date(reference.getTime() + 8 * 60 * 60 * 1000);
  return `${taipeiDate.getUTCFullYear()}-${String(taipeiDate.getUTCMonth() + 1).padStart(2, '0')}-${String(taipeiDate.getUTCDate()).padStart(2, '0')}`;
}

export function fixedRankDelta(rank: number, maxRank: number, firstDelta: number): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > maxRank) return 0;
  return firstDelta - (rank - 1);
}

export function roleBonus(role: string): number {
  const normalized = role.trim();
  if (normalized === '班长' || normalized === '团支书' || normalized === '劳动委员' || normalized === '纪律委员') return 10;
  if (normalized === '学习委员' || normalized === '课代表' || normalized === '网管') return 4;
  if (normalized === '寝室长') return 3;
  return 5;
}
