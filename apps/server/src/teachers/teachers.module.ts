import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ClassroomsModule } from '../classrooms';
import { RealtimeModule } from '../realtime';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  imports: [AuthModule, ClassroomsModule, RealtimeModule],
  controllers: [TeachersController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
