import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class BindByCodeDto {
  @ApiProperty({ example: '583921', pattern: '^\\d{6}$' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;
}

export class BindByCodeResponseClassroomDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class BindByCodeResponseDto {
  @ApiProperty()
  deviceId: string;

  @ApiProperty()
  credential: string;

  @ApiProperty({ type: BindByCodeResponseClassroomDto })
  classroom: BindByCodeResponseClassroomDto;
}

export class BindByCodeEnvelopeDto {
  @ApiProperty({ type: BindByCodeResponseDto })
  data: BindByCodeResponseDto;
}
