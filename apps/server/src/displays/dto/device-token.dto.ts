import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeviceTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  deviceId: string;

  @ApiProperty({ description: '绑定完成时由大屏一次性领取的长期凭证' })
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  credential: string;
}
