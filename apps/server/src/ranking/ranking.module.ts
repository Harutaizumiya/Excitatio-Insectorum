import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { RankingController } from './ranking.controller';
import { RankingQueryService } from './ranking-query.service';
import { RankingService } from './ranking.service';
import { WeekOverWeekRankChangeStrategy } from './week-over-week-rank-change.strategy';

@Module({
  imports: [PrismaModule],
  controllers: [RankingController],
  providers: [RankingQueryService, WeekOverWeekRankChangeStrategy, RankingService],
  exports: [RankingService],
})
export class RankingModule {}
