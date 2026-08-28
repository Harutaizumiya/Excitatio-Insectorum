import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CLASS_REALTIME_PUBLISHER } from '../common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [
    RealtimeService,
    RealtimeGateway,
    { provide: CLASS_REALTIME_PUBLISHER, useExisting: RealtimeService },
  ],
  exports: [RealtimeService, CLASS_REALTIME_PUBLISHER],
})
export class RealtimeModule {}
