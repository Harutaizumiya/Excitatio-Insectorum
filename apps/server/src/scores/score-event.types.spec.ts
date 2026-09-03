import { ScoreEventType } from '@prisma/client';
import {
  fixedRankDelta,
  getTaipeiDateKey,
  getTaipeiMonthPeriod,
  roleBonus,
} from './score-event.types';

describe('score event policy helpers', () => {
  it('uses Taipei month boundaries while returning UTC instants', () => {
    const beforeBoundary = getTaipeiMonthPeriod(new Date('2026-07-31T15:59:59.999Z'));
    const atBoundary = getTaipeiMonthPeriod(new Date('2026-07-31T16:00:00.000Z'));

    expect(beforeBoundary.startAt.toISOString()).toBe('2026-06-30T16:00:00.000Z');
    expect(beforeBoundary.endAt.toISOString()).toBe('2026-07-31T16:00:00.000Z');
    expect(atBoundary.startAt.toISOString()).toBe('2026-07-31T16:00:00.000Z');
    expect(atBoundary.endAt.toISOString()).toBe('2026-08-31T16:00:00.000Z');
    expect(getTaipeiDateKey(new Date('2026-07-31T16:00:00.000Z'))).toBe('2026-08-01');
  });

  it('maps rank rules to their handbook values', () => {
    expect(fixedRankDelta(1, 10, 10)).toBe(10);
    expect(fixedRankDelta(10, 10, 10)).toBe(1);
    expect(fixedRankDelta(8, 8, 10)).toBe(3);
    expect(fixedRankDelta(0, 8, 10)).toBe(0);
    expect(fixedRankDelta(9, 8, 10)).toBe(0);
  });

  it('maps committee roles to handbook rewards', () => {
    expect(roleBonus('班长')).toBe(10);
    expect(roleBonus('团支书')).toBe(10);
    expect(roleBonus('学习委员')).toBe(4);
    expect(roleBonus('寝室长')).toBe(3);
    expect(roleBonus('宣传委员')).toBe(5);
  });

  it('keeps the policy type sourced from Prisma', () => {
    expect(ScoreEventType.LATE).toBe('LATE');
  });
});
