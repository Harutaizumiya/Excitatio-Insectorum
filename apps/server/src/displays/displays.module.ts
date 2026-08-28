import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ClassAccessGuard, JwtAuthGuard, PrincipalTypeGuard, RoleGuard } from '../common';
import { RankingModule } from '../ranking';
import { RealtimeModule } from '../realtime';
import { DisplayBindingController } from './display-binding.controller';
import { DisplayDevicesController } from './display-devices.controller';
import { DisplayController } from './display.controller';
import { DisplaysService } from './displays.service';

@Module({
  imports: [AuthModule, RankingModule, RealtimeModule],
  controllers: [DisplayBindingController, DisplayDevicesController, DisplayController],
  providers: [DisplaysService, JwtAuthGuard, ClassAccessGuard, RoleGuard, PrincipalTypeGuard],
  exports: [DisplaysService],
})
export class DisplaysModule {}
