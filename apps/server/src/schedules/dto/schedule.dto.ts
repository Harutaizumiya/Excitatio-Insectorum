import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const SCHEDULE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class SchedulePeriodInputDto {
  @ApiProperty({ minimum: 1, maximum: 12, example: 1 })
  @IsInt()
  @Min(1)
  @Max(12)
  periodNo!: number;

  @ApiProperty({ example: '08:00' })
  @IsString()
  @Matches(SCHEDULE_TIME_PATTERN)
  startTime!: string;

  @ApiProperty({ example: '08:45' })
  @IsString()
  @Matches(SCHEDULE_TIME_PATTERN)
  endTime!: string;
}

export class ScheduleTemplateInputDto {
  @ApiProperty({ example: 'standard' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  clientKey!: string;

  @ApiPropertyOptional({ example: 'schedule-template-1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  id?: string;

  @ApiProperty({ example: '标准作息' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ type: [SchedulePeriodInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SchedulePeriodInputDto)
  periods!: SchedulePeriodInputDto[];
}

export class ScheduleEntryInputDto {
  @ApiProperty({ minimum: 1, maximum: 7, example: 1 })
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  @ApiProperty({ minimum: 1, maximum: 12, example: 1 })
  @IsInt()
  @Min(1)
  @Max(12)
  periodNo!: number;

  @ApiProperty({ example: '数学' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  courseName!: string;

  @ApiPropertyOptional({ nullable: true, example: 'class-teacher-math' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  classTeacherId?: string | null;
}

export class SaveScheduleDto {
  @ApiProperty({ example: 'standard' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  activeTemplateKey!: string;

  @ApiProperty({ type: [ScheduleTemplateInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScheduleTemplateInputDto)
  templates!: ScheduleTemplateInputDto[];

  @ApiProperty({ type: [ScheduleEntryInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleEntryInputDto)
  entries!: ScheduleEntryInputDto[];
}

export class SchedulePeriodResponseDto {
  @ApiProperty()
  periodNo!: number;

  @ApiProperty({ example: '08:00' })
  startTime!: string;

  @ApiProperty({ example: '08:45' })
  endTime!: string;
}

export class ScheduleTemplateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [SchedulePeriodResponseDto] })
  periods!: SchedulePeriodResponseDto[];
}

export class ScheduleTeacherResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class ScheduleEntryResponseDto {
  @ApiProperty()
  weekday!: number;

  @ApiProperty()
  periodNo!: number;

  @ApiProperty()
  courseName!: string;

  @ApiProperty({ nullable: true })
  classTeacherId!: string | null;

  @ApiProperty({ type: ScheduleTeacherResponseDto, nullable: true })
  teacher!: ScheduleTeacherResponseDto | null;
}

export class ScheduleResponseDto {
  @ApiProperty({ nullable: true })
  activeTemplateId!: string | null;

  @ApiProperty({ type: [ScheduleTemplateResponseDto] })
  templates!: ScheduleTemplateResponseDto[];

  @ApiProperty({ type: [ScheduleEntryResponseDto] })
  entries!: ScheduleEntryResponseDto[];
}

export class ScheduleResponseEnvelopeDto {
  @ApiProperty({ type: ScheduleResponseDto })
  data!: ScheduleResponseDto;
}
