import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MinLength, NotEquals } from 'class-validator';

export class CreateCustomScoreDto {
  @ApiProperty({ example: 'cm123student' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ example: 5, description: '非 0 整数，支持正负数' })
  @IsInt()
  @NotEquals(0)
  delta: number;

  @ApiProperty({ example: '课堂完成高难度题目并帮助其他同学理解解法', minLength: 10 })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  reason: string;
}
