import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScoreRecordType } from '@prisma/client';

export class ScoreRuleResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  classId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  delta: number;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  createdBy: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class NamedEntityResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class ScoreRecordResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: NamedEntityResponseDto })
  student: NamedEntityResponseDto;

  @ApiProperty({ type: NamedEntityResponseDto })
  operator: NamedEntityResponseDto;

  @ApiPropertyOptional({ nullable: true })
  subject: string | null;

  @ApiPropertyOptional({ type: NamedEntityResponseDto, nullable: true })
  rule: NamedEntityResponseDto | null;

  @ApiProperty()
  delta: number;

  @ApiPropertyOptional({ nullable: true })
  reason: string | null;

  @ApiProperty({ enum: ScoreRecordType })
  recordType: ScoreRecordType;

  @ApiProperty()
  reverted: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

export class ScoreRuleDataResponseDto {
  @ApiProperty({ type: ScoreRuleResponseDto })
  data: ScoreRuleResponseDto;
}

export class ScoreRuleListResponseDto {
  @ApiProperty({ type: [ScoreRuleResponseDto] })
  data: ScoreRuleResponseDto[];
}

export class ScoreRecordDataResponseDto {
  @ApiProperty({ type: ScoreRecordResponseDto })
  data: ScoreRecordResponseDto;
}

export class PaginationMetaDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  total: number;
}

export class ScoreRecordListResponseDto {
  @ApiProperty({ type: [ScoreRecordResponseDto] })
  data: ScoreRecordResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
