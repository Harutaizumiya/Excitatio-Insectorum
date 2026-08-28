import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  NotEquals,
} from 'class-validator';

export class UpdateScoreRuleDto {
  @ApiPropertyOptional({ example: '积极回答', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '课堂表现', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  group?: string;

  @ApiPropertyOptional({ example: 3, description: '非 0 整数' })
  @IsOptional()
  @IsInt()
  @NotEquals(0)
  delta?: number;

  @ApiPropertyOptional({ example: '课堂主动回答问题', nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
