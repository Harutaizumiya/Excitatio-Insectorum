import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { RealtimeModule } from '../realtime/realtime.module';
import { ScoreRecordsController } from './score-records.controller';
import { ScoreRecordsService } from './score-records.service';
import { ScoreRulesController } from './score-rules.controller';
import { ScoreRulesService } from './score-rules.service';

@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [ScoreRulesController, ScoreRecordsController],
  providers: [ScoreRulesService, ScoreRecordsService],
  exports: [ScoreRulesService, ScoreRecordsService],
})
export class ScoresModule {}
