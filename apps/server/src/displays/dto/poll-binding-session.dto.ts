import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class PollBindingSessionDto {
  @ApiProperty({ description: '创建绑定码时仅返回给大屏的随机 nonce' })
  @IsString()
  @MinLength(32)
  nonce: string;
}

export class PollBindingSessionResponseDto {
  @ApiProperty({ enum: ['PENDING', 'READY'] })
  status: 'PENDING' | 'READY';

  @ApiProperty({ required: false })
  deviceId?: string;

  @ApiProperty({
    required: false,
    description: '长期设备凭证，仅在 READY 后成功领取一次；服务端只持久化 hash',
  })
  credential?: string;
}
