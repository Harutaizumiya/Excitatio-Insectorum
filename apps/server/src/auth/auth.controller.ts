import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  PrincipalType,
  PrincipalTypeGuard,
  RequirePrincipalTypes,
  type RequestContext,
} from '../common';
import { AuthService } from './auth.service';
import { ConsumeInvitationDto } from './dto/consume-invitation.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '账号密码登录' })
  async login(@Req() request: RequestContext, @Body() dto: LoginDto) {
    return { data: await this.auth.login(dto.account, dto.password, request.ip ?? 'unknown') };
  }

  @Post('refresh')
  @ApiOperation({ summary: '轮换 Refresh Token' })
  async refresh(@Req() request: RequestContext, @Body() dto: RefreshTokenDto) {
    return { data: await this.auth.refresh(dto.refreshToken, request.ip ?? 'unknown') };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, PrincipalTypeGuard)
  @RequirePrincipalTypes(PrincipalType.USER)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '吊销当前会话' })
  async logout(@Req() request: RequestContext) {
    const principal = request.user!;
    if (principal.type === 'USER') {
      await this.auth.logout(principal.sub, principal.sessionId);
    }
    return { data: { loggedOut: true } };
  }

  @Post('invitations/:token/consume')
  @ApiOperation({ summary: '一次性消费任课教师邀请' })
  async consumeInvitation(
    @Req() request: RequestContext,
    @Param('token') token: string,
    @Body() dto: ConsumeInvitationDto,
  ) {
    return {
      data: await this.auth.consumeInvitation(token, dto.deviceName, request.ip ?? 'unknown'),
    };
  }
}
