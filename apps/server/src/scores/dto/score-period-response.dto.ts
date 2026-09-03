import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScoreEventType, ScorePeriodStatus } from '@prisma/client';

export class ScorePeriodViewDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  startAt: Date;

  @ApiProperty()
  endAt: Date;

  @ApiProperty()
  initialScore: number;

  @ApiProperty({ enum: ScorePeriodStatus })
  status: ScorePeriodStatus;

  @ApiPropertyOptional({ nullable: true })
  settledAt: Date | null;
}

export class PeriodScoreStudentDto {
  @ApiProperty()
  studentId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  score: number;

  @ApiProperty()
  rank: number;
}

export class ScorePeriodSummaryDto {
  @ApiPropertyOptional({ type: ScorePeriodViewDto, nullable: true })
  period: ScorePeriodViewDto | null;

  @ApiProperty({ type: [ScorePeriodViewDto] })
  periods: ScorePeriodViewDto[];

  @ApiProperty({ type: Object })
  range: { startAt: Date; endAt: Date };

  @ApiProperty({ type: [PeriodScoreStudentDto] })
  students: PeriodScoreStudentDto[];

  @ApiProperty({ type: [PeriodScoreStudentDto] })
  top3: PeriodScoreStudentDto[];

  @ApiProperty({ type: [PeriodScoreStudentDto] })
  recommendedSeatOrder: PeriodScoreStudentDto[];
}

export class ScoreEventRecordResultDto {
  @ApiProperty()
  studentId: string;

  @ApiProperty()
  delta: number;
}

export class ScoreEventResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ScoreEventType })
  type: ScoreEventType;

  @ApiProperty()
  periodId: string;

  @ApiProperty()
  occurredAt: Date;

  @ApiProperty({ type: [String] })
  studentIds: string[];

  @ApiProperty({ type: [ScoreEventRecordResultDto] })
  records: ScoreEventRecordResultDto[];
}

export class CommitteeAssignmentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  studentId: string;

  @ApiProperty()
  studentName: string;

  @ApiProperty()
  role: string;

  @ApiPropertyOptional({ nullable: true })
  subject: string | null;

  @ApiProperty()
  termStartAt: Date;

  @ApiPropertyOptional({ nullable: true })
  termEndAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  trialEndsAt: Date | null;

  @ApiProperty()
  status: string;
}

export class CommitteeListResponseDto {
  @ApiProperty({ type: [CommitteeAssignmentResponseDto] })
  data: CommitteeAssignmentResponseDto[];
}
