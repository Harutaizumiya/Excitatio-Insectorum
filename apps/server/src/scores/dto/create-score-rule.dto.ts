import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, NotEquals } from 'class-validator';

export class CreateScoreRuleDto {
  @ApiProperty({ example: '回答问题', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 2, description: '非 0 整数，支持正负数' })
  @IsInt()
  @NotEquals(0)
  delta: number;

  @ApiPropertyOptional({ example: '课堂主动回答问题', nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;
}
