import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScoreEventType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateScoreEventDto {
  @ApiProperty({ enum: ScoreEventType })
  @IsEnum(ScoreEventType)
  type: ScoreEventType;

  @ApiProperty({ type: [String], example: ['cm123student'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  studentIds: string[];

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  occurredAt?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minutesLate?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  rank?: number;

  @ApiPropertyOptional({ description: '教师最终确认分值；仅人工确认事件使用。' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-10000)
  @Max(10000)
  manualDelta?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOrganizer?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  specialContribution?: boolean;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subject?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  businessKey?: string;
}
