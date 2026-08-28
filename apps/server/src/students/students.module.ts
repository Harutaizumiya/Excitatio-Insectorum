import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ClassroomsModule } from '../classrooms';
import { RealtimeModule } from '../realtime';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [AuthModule, ClassroomsModule, RealtimeModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
