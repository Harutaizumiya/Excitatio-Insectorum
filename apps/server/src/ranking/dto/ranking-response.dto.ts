import { ApiProperty } from '@nestjs/swagger';
import { RANKING_PERIOD_TYPE, WEEK_OVER_WEEK_STRATEGY } from '../ranking.types';

export class RankingPeriodResponseDto {
  @ApiProperty({ enum: [RANKING_PERIOD_TYPE] })
  type: typeof RANKING_PERIOD_TYPE;

  @ApiProperty({ type: String, format: 'date-time' })
  startAt: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: '下周一 00:00:00.000Z（半开区间的排他上界）',
  })
  endAt: string;
}

export class TopRankingItemDto {
  @ApiProperty()
  studentId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  rank: number;
}

export class ProgressRankingItemDto {
  @ApiProperty()
  studentId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  previousRank: number;

  @ApiProperty()
  currentRank: number;

  @ApiProperty({ description: '上周名次 - 本周名次' })
  change: number;
}

export class WeeklyRankingDto {
  @ApiProperty({ type: RankingPeriodResponseDto })
  period: RankingPeriodResponseDto;

  @ApiProperty({ type: [TopRankingItemDto] })
  top3: TopRankingItemDto[];

  @ApiProperty({ type: [ProgressRankingItemDto] })
  progress: ProgressRankingItemDto[];

  @ApiProperty({ enum: [WEEK_OVER_WEEK_STRATEGY] })
  strategy: typeof WEEK_OVER_WEEK_STRATEGY;
}

export class WeeklyRankingResponseDto {
  @ApiProperty({ type: WeeklyRankingDto })
  data: WeeklyRankingDto;
}
