import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { StudentGender } from '@prisma/client';
import { MAX_IMPORT_RECORDS } from '../student-import.constants';

export class ImportedStudentDto {
  @ApiProperty({ example: '张三' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: '20260101', nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  studentNo?: string | null;

  @ApiPropertyOptional({ enum: StudentGender, default: StudentGender.UNKNOWN })
  @IsOptional()
  @IsEnum(StudentGender)
  gender?: StudentGender;
}

export class ImportStudentsDto {
  @ApiProperty({ type: [ImportedStudentDto], maxItems: MAX_IMPORT_RECORDS })
  @IsArray()
  @ArrayMaxSize(MAX_IMPORT_RECORDS)
  @ValidateNested({ each: true })
  @Type(() => ImportedStudentDto)
  students!: ImportedStudentDto[];
}
