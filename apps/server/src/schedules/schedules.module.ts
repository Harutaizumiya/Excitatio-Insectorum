import { Module } from '@nestjs/common';
import { ClassroomsModule } from '../classrooms';
import { PrismaModule } from '../prisma';
import { RealtimeModule } from '../realtime';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [ClassroomsModule, PrismaModule, RealtimeModule],
  controllers: [SchedulesController],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
