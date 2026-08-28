import type { PrismaService } from '../prisma';
import { RankingQueryService, rankStudentTotals } from './ranking-query.service';
import { RankingService } from './ranking.service';
import { getUtcWeekPeriod, type RankedStudent } from './ranking.types';
import { WeekOverWeekRankChangeStrategy } from './week-over-week-rank-change.strategy';

describe('weekly ranking', () => {
  it('uses an explicit UTC Monday half-open week boundary', () => {
    const period = getUtcWeekPeriod(new Date('2026-08-30T23:59:59.999Z'));

    expect(period.startAt.toISOString()).toBe('2026-08-24T00:00:00.000Z');
    expect(period.endAt.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('assigns competition ranks for ties with deterministic studentId ordering', () => {
    const ranked = rankStudentTotals([
      { studentId: 'student-c', name: 'C', score: 5 },
      { studentId: 'student-b', name: 'B', score: 10 },
      { studentId: 'student-a', name: 'A', score: 10 },
      { studentId: 'student-d', name: 'D', score: -1 },
    ]);

    expect(ranked.map(({ studentId, rank }) => ({ studentId, rank }))).toEqual([
      { studentId: 'student-a', rank: 1 },
      { studentId: 'student-b', rank: 1 },
      { studentId: 'student-c', rank: 3 },
      { studentId: 'student-d', rank: 4 },
    ]);
  });

  it('aggregates NORMAL and REVERT deltas and excludes inactive students', async () => {
    const prisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'active-a', name: 'A' },
          { id: 'active-b', name: 'B' },
        ]),
      },
      scoreRecord: {
        groupBy: jest.fn().mockResolvedValue([
          { studentId: 'active-a', _sum: { delta: 4 } },
          { studentId: 'active-b', _sum: { delta: 0 } },
        ]),
      },
    } as unknown as PrismaService;
    const query = new RankingQueryService(prisma);

    const ranking = await query.getRanking(
      'class-1',
      new Date('2026-08-24T00:00:00.000Z'),
      new Date('2026-08-31T00:00:00.000Z'),
    );

    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { classId: 'class-1', status: 'ACTIVE' } }),
    );
    const groupByArgument = (prisma.scoreRecord.groupBy as jest.Mock).mock.calls[0][0];
    expect(groupByArgument.where.recordType).toBeUndefined();
    expect(groupByArgument.where.createdAt).toEqual({
      gte: new Date('2026-08-24T00:00:00.000Z'),
      lt: new Date('2026-08-31T00:00:00.000Z'),
    });
    expect(ranking.map(({ studentId, score }) => ({ studentId, score }))).toEqual([
      { studentId: 'active-a', score: 4 },
      { studentId: 'active-b', score: 0 },
    ]);
  });

  it('computes only positive week-over-week rank changes deterministically', async () => {
    const current: RankedStudent[] = [
      { studentId: 'a', name: 'A', rank: 1, score: 10 },
      { studentId: 'b', name: 'B', rank: 2, score: 8 },
      { studentId: 'c', name: 'C', rank: 3, score: 6 },
    ];
    const previous: RankedStudent[] = [
      { studentId: 'a', name: 'A', rank: 3, score: 1 },
      { studentId: 'b', name: 'B', rank: 1, score: 9 },
      { studentId: 'c', name: 'C', rank: 2, score: 7 },
    ];
    const rankingQuery = {
      getRanking: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(previous),
    } as unknown as RankingQueryService;
    const strategy = new WeekOverWeekRankChangeStrategy(rankingQuery);
    const period = getUtcWeekPeriod(new Date('2026-08-25T12:00:00.000Z'));

    await expect(strategy.getProgressRanking('class-1', period)).resolves.toEqual([
      {
        studentId: 'a',
        name: 'A',
        previousRank: 3,
        currentRank: 1,
        change: 2,
      },
    ]);
    expect(rankingQuery.getRanking).toHaveBeenNthCalledWith(
      2,
      'class-1',
      new Date('2026-08-17T00:00:00.000Z'),
      new Date('2026-08-24T00:00:00.000Z'),
    );
  });

  it('never exposes score in Top3 or progress responses', async () => {
    const current: RankedStudent[] = [
      { studentId: 'a', name: 'A', rank: 1, score: 99 },
      { studentId: 'b', name: 'B', rank: 2, score: 50 },
    ];
    const rankingQuery = {
      getRanking: jest.fn().mockResolvedValue(current),
    } as unknown as RankingQueryService;
    const progressStrategy = {
      getProgressRanking: jest
        .fn()
        .mockResolvedValue([
          { studentId: 'a', name: 'A', previousRank: 2, currentRank: 1, change: 1 },
        ]),
    } as unknown as WeekOverWeekRankChangeStrategy;
    const service = new RankingService(rankingQuery, progressStrategy);

    const response = await service.getWeeklyRanking(
      'class-1',
      new Date('2026-08-25T12:00:00.000Z'),
    );

    expect(JSON.stringify(response)).not.toContain('score');
    expect(response.top3).toEqual([
      { studentId: 'a', name: 'A', rank: 1 },
      { studentId: 'b', name: 'B', rank: 2 },
    ]);
  });
});
