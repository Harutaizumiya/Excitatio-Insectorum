import { Injectable } from '@nestjs/common';
import type { WeeklyRankingDto } from './dto';
import { RankingQueryService } from './ranking-query.service';
import { getUtcWeekPeriod, WEEK_OVER_WEEK_STRATEGY } from './ranking.types';
import { WeekOverWeekRankChangeStrategy } from './week-over-week-rank-change.strategy';

@Injectable()
export class RankingService {
  constructor(
    private readonly rankingQuery: RankingQueryService,
    private readonly progressStrategy: WeekOverWeekRankChangeStrategy,
  ) {}

  async getWeeklyRanking(classId: string, reference = new Date()): Promise<WeeklyRankingDto> {
    const period = getUtcWeekPeriod(reference);
    const [currentRanking, progress] = await Promise.all([
      this.rankingQuery.getRanking(classId, period.startAt, period.endAt),
      this.progressStrategy.getProgressRanking(classId, period),
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
