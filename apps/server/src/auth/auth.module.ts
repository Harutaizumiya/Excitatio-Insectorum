import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RealtimeModule } from '../realtime';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PasswordHasherService } from './password-hasher.service';

@Module({
  imports: [PassportModule, JwtModule.register({}), RealtimeModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PasswordHasherService],
  exports: [AuthService, PasswordHasherService, JwtModule, PassportModule],
})
export class AuthModule {}
