import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateRuleScoreDto {
  @ApiProperty({ example: 'cm123student' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ example: 'cm123rule' })
  @IsString()
  @IsNotEmpty()
  ruleId: string;
}
