import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ConsumeInvitationDto {
  @ApiProperty({ example: 'iPhone Safari' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  deviceName!: string;
}
