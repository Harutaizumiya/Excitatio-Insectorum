import { ApiProperty } from '@nestjs/swagger';

export class CreateBindingCodeResponseDto {
  @ApiProperty({ example: '583921', pattern: '^\\d{6}$' })
  code: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;

  @ApiProperty({ format: 'uuid' })
  bindingSessionId: string;

  @ApiProperty({
    description: '仅交给发起绑定的大屏；轮询领取设备凭证时必须提供，切勿展示给班主任',
  })
  nonce: string;
}
