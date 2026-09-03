import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CommitteeAssignmentInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ example: '班长' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  role: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subject?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString()
  termStartAt: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  termEndAt?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  trialEndsAt?: string | null;
}

export class UpdateCommitteeDto {
  @ApiProperty({ type: [CommitteeAssignmentInputDto] })
  @IsArray()
  @ArrayUnique((assignment: CommitteeAssignmentInputDto) => `${assignment.studentId}:${assignment.role}:${assignment.termStartAt}`)
  @ValidateNested({ each: true })
  @Type(() => CommitteeAssignmentInputDto)
  assignments: CommitteeAssignmentInputDto[];
}
