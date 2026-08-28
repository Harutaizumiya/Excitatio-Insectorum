import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ClassAccessGuard, JwtAuthGuard, RoleGuard } from '../common';
import { RealtimeModule } from '../realtime';
import { RandomPickController } from './random-pick.controller';
import { RandomPickService } from './random-pick.service';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [RandomPickController],
  providers: [RandomPickService, JwtAuthGuard, ClassAccessGuard, RoleGuard],
  exports: [RandomPickService],
})
export class RandomPickModule {}
