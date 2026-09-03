import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { RealtimeModule } from '../realtime/realtime.module';
import { ScoreRecordsController } from './score-records.controller';
import { ScoreRecordsService } from './score-records.service';
import { ScoreRulesController } from './score-rules.controller';
import { ScoreRulesService } from './score-rules.service';
import { ScoreCommitteeService } from './score-committee.service';
import { ScoreEventsService } from './score-events.service';
import { ScorePeriodsController } from './score-periods.controller';
import { ScorePeriodsService } from './score-periods.service';

@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [ScoreRulesController, ScoreRecordsController, ScorePeriodsController],
  providers: [ScoreRulesService, ScoreRecordsService, ScorePeriodsService, ScoreEventsService, ScoreCommitteeService],
  exports: [ScoreRulesService, ScoreRecordsService, ScorePeriodsService, ScoreEventsService, ScoreCommitteeService],
})
export class ScoresModule {}
