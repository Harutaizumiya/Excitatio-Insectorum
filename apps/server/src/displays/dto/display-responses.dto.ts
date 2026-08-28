import { ApiProperty } from '@nestjs/swagger';
import { DeviceStatus } from '@prisma/client';
import { CreateBindingCodeResponseDto } from './create-binding-code.dto';
import { PollBindingSessionResponseDto } from './poll-binding-session.dto';

export class DeviceTokenResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ example: 1800 })
  expiresIn: number;
}

export class BindDisplayDeviceResponseDto {
  @ApiProperty()
  deviceId: string;
}

export class CreateBindingCodeEnvelopeDto {
  @ApiProperty({ type: CreateBindingCodeResponseDto })
  data: CreateBindingCodeResponseDto;
}

export class PollBindingSessionEnvelopeDto {
  @ApiProperty({ type: PollBindingSessionResponseDto })
  data: PollBindingSessionResponseDto;
}

export class BindDisplayDeviceEnvelopeDto {
  @ApiProperty({ type: BindDisplayDeviceResponseDto })
  data: BindDisplayDeviceResponseDto;
}

export class DeviceTokenEnvelopeDto {
  @ApiProperty({ type: DeviceTokenResponseDto })
  data: DeviceTokenResponseDto;
}

export class DisplayDeviceListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: DeviceStatus })
  status: DeviceStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastSeenAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  revokedAt: Date | null;

  @ApiProperty()
  online: boolean;
}

export class DisplayDeviceListEnvelopeDto {
  @ApiProperty({ type: [DisplayDeviceListItemDto] })
  data: DisplayDeviceListItemDto[];
}

export class DisplayStudentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class DisplaySeatDto {
  @ApiProperty()
  row: number;

  @ApiProperty()
  col: number;

  @ApiProperty({ type: DisplayStudentDto, nullable: true })
  student: DisplayStudentDto | null;
}

export class DisplayLayoutDto {
  @ApiProperty({ nullable: true })
  version: number | null;

  @ApiProperty({ type: [DisplaySeatDto] })
  seats: DisplaySeatDto[];
}

export class DisplayClassroomDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  gridRows: number;

  @ApiProperty()
  gridCols: number;
}

export class DisplayTop3ItemDto {
  @ApiProperty()
  studentId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  rank: number;
}

export class DisplayProgressItemDto {
  @ApiProperty()
  studentId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: '上周名次 - 本周名次' })
  change: number;
}

export class DisplayRankingDto {
  @ApiProperty({ type: [DisplayTop3ItemDto] })
  top3: DisplayTop3ItemDto[];

  @ApiProperty({ type: [DisplayProgressItemDto] })
  progress: DisplayProgressItemDto[];
}

export class DisplayBootstrapDto {
  @ApiProperty({ type: DisplayClassroomDto })
  classroom: DisplayClassroomDto;

  @ApiProperty({ type: DisplayLayoutDto })
  layout: DisplayLayoutDto;

  @ApiProperty({ type: DisplayRankingDto })
  ranking: DisplayRankingDto;
}

export class DisplayBootstrapEnvelopeDto {
  @ApiProperty({ type: DisplayBootstrapDto })
  data: DisplayBootstrapDto;
}
