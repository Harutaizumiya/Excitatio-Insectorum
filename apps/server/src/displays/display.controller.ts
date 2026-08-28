import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  isDisplayPrincipal,
  JwtAuthGuard,
  PrincipalType,
  PrincipalTypeGuard,
  RequirePrincipalTypes,
  type RequestContext,
} from '../common';
import { DisplaysService } from './displays.service';
import {
  DeviceTokenDto,
  DeviceTokenEnvelopeDto,
  DeviceTokenResponseDto,
  DisplayBootstrapDto,
  DisplayBootstrapEnvelopeDto,
} from './dto';

@ApiTags('Display')
@Controller('display')
export class DisplayController {
  constructor(private readonly displays: DisplaysService) {}

  @Post('auth/token')
  @HttpCode(200)
  @ApiOperation({ summary: '使用长期设备凭证换取短期 DISPLAY_DEVICE access token' })
  @ApiResponse({ status: 200, type: DeviceTokenEnvelopeDto })
  @ApiResponse({ status: 401, description: 'INVALID_DEVICE_CREDENTIAL' })
  async token(@Body() input: DeviceTokenDto): Promise<{ data: DeviceTokenResponseDto }> {
    return {
      data: await this.displays.exchangeCredential(input.deviceId, input.credential),
    };
  }

  @Get('bootstrap')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PrincipalTypeGuard)
  @RequirePrincipalTypes(PrincipalType.DISPLAY_DEVICE)
  @ApiOperation({
    summary: '获取大屏完整初始状态',
    description:
      'classId 仅从设备 token 获取；每次校验设备仍为 ACTIVE。排行榜只返回姓名、名次/变化，不返回 score。',
  })
  @ApiResponse({ status: 200, type: DisplayBootstrapEnvelopeDto })
  @ApiResponse({ status: 401, description: 'DISPLAY_DEVICE_REVOKED' })
  async bootstrap(@Req() request: RequestContext): Promise<{ data: DisplayBootstrapDto }> {
    if (!request.user || !isDisplayPrincipal(request.user)) {
      // PrincipalTypeGuard normally handles this branch; keeping it explicit avoids trusting a cast.
      throw new Error('Display principal was not attached by JWT authentication');
    }
    return {
      data: await this.displays.getBootstrap(request.user.sub, request.user.classId),
    };
  }
}
