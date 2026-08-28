import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ClassroomsModule } from '../classrooms';
import { RealtimeModule } from '../realtime';
import { StudentsController } from './students.controller';
import { StudentImportService } from './import/student-import.service';
import { StudentsService } from './students.service';

@Module({
  imports: [AuthModule, ClassroomsModule, RealtimeModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentImportService],
  exports: [StudentsService],
})
export class StudentsModule {}
