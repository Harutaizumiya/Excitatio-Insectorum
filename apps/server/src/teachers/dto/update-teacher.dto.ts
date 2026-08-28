import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTeacherDto {
  @ApiPropertyOptional({ example: '李老师' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '数学' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  subject?: string;
}
