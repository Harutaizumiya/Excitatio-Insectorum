import { Injectable } from '@nestjs/common';
import { RankingQueryService } from './ranking-query.service';
import {
  previousPeriod,
  type ProgressItem,
  type RankingPeriod,
  type RankingStrategy,
} from './ranking.types';

@Injectable()
export class WeekOverWeekRankChangeStrategy implements RankingStrategy {
  constructor(private readonly rankingQuery: RankingQueryService) {}

  async getProgressRanking(classId: string, period: RankingPeriod): Promise<ProgressItem[]> {
    const previous = previousPeriod(period);
    const [currentRanking, previousRanking] = await Promise.all([
      this.rankingQuery.getRanking(classId, period.startAt, period.endAt),
      this.rankingQuery.getRanking(classId, previous.startAt, previous.endAt),
    ]);
    const previousByStudentId = new Map(
      previousRanking.map((student) => [student.studentId, student.rank]),
    );

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
}
