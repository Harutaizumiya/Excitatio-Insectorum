import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { StudentGender } from '@prisma/client';

export class CreateStudentDto {
  @ApiProperty({ example: '张三' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: '1001' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  studentNo?: string;

  @ApiPropertyOptional({ enum: StudentGender, default: StudentGender.UNKNOWN })
  @IsOptional()
  @IsEnum(StudentGender)
  gender?: StudentGender;
}
