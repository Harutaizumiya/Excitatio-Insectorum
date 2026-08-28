import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { PrismaModule } from '../prisma';
import { RealtimeModule } from '../realtime';
import { ClassAccessGuard } from '../common/guards/class-access.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrincipalTypeGuard } from '../common/guards/principal-type.guard';
import { RoleGuard } from '../common/guards/role.guard';
import { SeatingController } from './seating.controller';
import { SeatingService } from './seating.service';

@Module({
  imports: [AuthModule, PrismaModule, RealtimeModule],
  controllers: [SeatingController],
  providers: [SeatingService, JwtAuthGuard, PrincipalTypeGuard, ClassAccessGuard, RoleGuard],
  exports: [SeatingService],
})
export class SeatingModule {}
