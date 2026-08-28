import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TeacherRole } from '@prisma/client';
import {
  ClassAccessGuard,
  ClassScope,
  JwtAuthGuard,
  RequireRoles,
  RoleGuard,
  type RequestContext,
} from '../common';
import { DisplaysService } from './displays.service';
import {
  BindDisplayDeviceDto,
  BindDisplayDeviceEnvelopeDto,
  BindingSessionStatusEnvelopeDto,
  type BindingSessionStatusResponseDto,
  CreateClassroomBindingCodeDto,
  CreateClassroomBindingCodeEnvelopeDto,
  type CreateClassroomBindingCodeResponseDto,
  DisplayDeviceListEnvelopeDto,
  type DisplayDeviceListItemDto,
} from './dto';

@ApiTags('Display Devices')
@ApiBearerAuth('access-token')
@Controller('classes/:classId/display-devices')
@UseGuards(JwtAuthGuard, ClassAccessGuard, RoleGuard)
@ClassScope()
@RequireRoles(TeacherRole.HEAD_TEACHER)
export class DisplayDevicesController {
  constructor(private readonly displays: DisplaysService) {}

  @Post('binding-code')
  @ApiOperation({
    summary: '班主任在后台生成 10 分钟有效的大屏绑定码',
    description: '输入设备名称后生成 6 位绑定码，由大屏端输入完成注册。每班最多两个 ACTIVE 设备。',
  })
  @ApiResponse({ status: 201, type: CreateClassroomBindingCodeEnvelopeDto })
  @ApiResponse({ status: 409, description: 'DISPLAY_DEVICE_LIMIT_REACHED' })
  async createBindingCode(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Body() input: CreateClassroomBindingCodeDto,
  ): Promise<{ data: CreateClassroomBindingCodeResponseDto }> {
    return {
      data: await this.displays.createClassroomBindingCode(
        classId,
        input,
        request.classAccess!.teacherId,
        request.ip ?? 'unknown',
      ),
    };
  }

  @Get('binding-sessions/:sessionId')
  @ApiOperation({ summary: '查询大屏绑定会话状态' })
  @ApiResponse({ status: 200, type: BindingSessionStatusEnvelopeDto })
  async getBindingSessionStatus(
    @Param('classId') classId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<{ data: BindingSessionStatusResponseDto }> {
    return {
      data: await this.displays.getClassroomBindingSessionStatus(classId, sessionId),
    };
  }

  @Post('bind')
  @ApiOperation({
    summary: '班主任使用绑定码绑定大屏',
    description:
      '响应刻意不包含长期 credential；大屏使用 bindingSessionId + nonce 轮询端点领取。每班最多两个 ACTIVE 设备。',
  })
  @ApiResponse({ status: 201, type: BindDisplayDeviceEnvelopeDto })
  @ApiResponse({ status: 409, description: 'DISPLAY_DEVICE_LIMIT_REACHED' })
  @ApiResponse({ status: 410, description: 'BINDING_CODE_INVALID / BINDING_CODE_EXPIRED' })
  async bind(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Body() input: BindDisplayDeviceDto,
  ): Promise<{ data: { deviceId: string } }> {
    return {
      data: await this.displays.bindDevice(
        classId,
        input,
        request.classAccess!.teacherId,
        request.ip ?? 'unknown',
      ),
    };
  }

  @Get()
  @ApiOperation({ summary: '列出本班大屏设备及最近在线状态' })
  @ApiResponse({ status: 200, type: DisplayDeviceListEnvelopeDto })
  async list(@Param('classId') classId: string): Promise<{ data: DisplayDeviceListItemDto[] }> {
    return { data: await this.displays.listDevices(classId) };
  }

  @Post(':deviceId/revoke')
  @ApiOperation({ summary: '吊销大屏及其全部长期凭证' })
  @ApiResponse({ status: 201, type: BindDisplayDeviceEnvelopeDto })
  @ApiResponse({ status: 404, description: 'DISPLAY_DEVICE_NOT_FOUND' })
  async revoke(
    @Param('classId') classId: string,
    @Param('deviceId') deviceId: string,
  ): Promise<{ data: { deviceId: string } }> {
    return { data: await this.displays.revokeDevice(classId, deviceId) };
  }
}
