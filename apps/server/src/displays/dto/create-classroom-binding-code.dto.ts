import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class CreateClassroomBindingCodeDto {
  @ApiProperty({ example: '教室前方大屏', maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  name: string;
}

export class CreateClassroomBindingCodeResponseDto {
  @ApiProperty({ example: '583921', pattern: '^\\d{6}$' })
  code: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;

  @ApiProperty({ format: 'uuid' })
  sessionId: string;
}

export class CreateClassroomBindingCodeEnvelopeDto {
  @ApiProperty({ type: CreateClassroomBindingCodeResponseDto })
  data: CreateClassroomBindingCodeResponseDto;
}

export class BindingSessionStatusResponseDto {
  @ApiProperty({ enum: ['PENDING', 'READY', 'EXPIRED'] })
  status: 'PENDING' | 'READY' | 'EXPIRED';

  @ApiProperty({ required: false })
  deviceId?: string;
}

export class BindingSessionStatusEnvelopeDto {
  @ApiProperty({ type: BindingSessionStatusResponseDto })
  data: BindingSessionStatusResponseDto;
}
