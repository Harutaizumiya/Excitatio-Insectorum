import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class ScorePeriodSummaryQueryDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class SettleScorePeriodDto {
  @ApiPropertyOptional({ description: '周期 ID；不填时结算当前月份之前的所有未结算周期。' })
  @IsOptional()
  periodId?: string;
}
