import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DisplaysService } from './displays.service';
import {
  BindByCodeDto,
  BindByCodeEnvelopeDto,
  type BindByCodeResponseDto,
  CreateBindingCodeResponseDto,
  CreateBindingCodeEnvelopeDto,
  PollBindingSessionEnvelopeDto,
  PollBindingSessionDto,
  PollBindingSessionResponseDto,
} from './dto';

@ApiTags('Display Binding')
@Controller('display')
export class DisplayBindingController {
  constructor(private readonly displays: DisplaysService) {}

  @Post('binding-codes')
  @ApiOperation({
    summary: '创建 5 分钟有效的六位大屏绑定码',
    description:
      '无需设备身份，按来源地址限速。nonce 只应保存在发起请求的大屏，并用于后续安全轮询。',
  })
  @ApiResponse({ status: 201, type: CreateBindingCodeEnvelopeDto })
  @ApiResponse({ status: 429, description: 'BINDING_CODE_RATE_LIMITED' })
  async createBindingCode(
    @Req() request: Request,
  ): Promise<{ data: CreateBindingCodeResponseDto }> {
    return { data: await this.displays.createBindingCode(request.ip ?? 'unknown') };
  }

  @Post('binding-sessions/:bindingSessionId/poll')
  @ApiOperation({
    summary: '由大屏轮询并一次性领取长期设备凭证',
    description:
      '这是绑定流程所必需的安全补全。调用者必须同时持有 bindingSessionId 与 nonce；班主任 bind 响应不会返回 credential。READY 凭证只能成功领取一次。',
  })
  @ApiResponse({ status: 200, type: PollBindingSessionEnvelopeDto })
  @ApiResponse({ status: 403, description: 'BINDING_SESSION_FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'BINDING_SESSION_NOT_FOUND' })
  @ApiResponse({ status: 410, description: 'BINDING_CREDENTIAL_ALREADY_CLAIMED' })
  async pollBindingSession(
    @Param('bindingSessionId') bindingSessionId: string,
    @Body() input: PollBindingSessionDto,
  ): Promise<{ data: PollBindingSessionResponseDto }> {
    return { data: await this.displays.pollBindingSession(bindingSessionId, input.nonce) };
  }

  @Post('bind-by-code')
  @ApiOperation({
    summary: '大屏端输入 6 位绑定码完成注册并获取凭证',
    description: '校验绑定码有效性，绑定成功后注册设备并一次性返回长期凭证，绑定码立即失效。',
  })
  @ApiResponse({ status: 201, type: BindByCodeEnvelopeDto })
  @ApiResponse({ status: 410, description: 'BINDING_CODE_INVALID / BINDING_CODE_EXPIRED' })
  async bindByCode(
    @Req() request: Request,
    @Body() input: BindByCodeDto,
  ): Promise<{ data: BindByCodeResponseDto }> {
    return {
      data: await this.displays.bindDisplayByCode(input, request.ip ?? 'unknown'),
    };
  }
}
