import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export const seatCellTypeValues = ['seat', 'aisle', 'podium', 'empty'] as const;
export type SeatCellTypeValue = (typeof seatCellTypeValues)[number];

export class SeatLayoutSeatDto {
  @ApiProperty({ minimum: 0, description: 'Zero-based row index' })
  @IsInt()
  @Min(0)
  row!: number;

  @ApiProperty({ minimum: 0, description: 'Zero-based column index' })
  @IsInt()
  @Min(0)
  col!: number;

  @ApiProperty({ enum: seatCellTypeValues, default: 'seat' })
  @IsOptional()
  @IsIn(seatCellTypeValues)
  cellType?: SeatCellTypeValue;

  @ApiProperty({ type: String, nullable: true, required: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  studentId?: string | null;
}

export class SaveSeatLayoutDto {
  @ApiProperty({ type: [SeatLayoutSeatDto], description: 'Complete seat snapshot' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatLayoutSeatDto)
  seats!: SeatLayoutSeatDto[];

  @ApiPropertyOptional({ minimum: 0, description: 'Expected current version; 0 means no layout' })
  @IsOptional()
  @IsInt()
  @Min(0)
  baseVersion?: number;
}

export class SeatLayoutVersionsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize = 20;
}
