import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class RandomPickDto {
  @ApiPropertyOptional({ type: [String], default: [] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  excludeStudentIds: string[] = [];
}

export class RandomPickResponseDto {
  @ApiProperty({
    example: { id: 'student-id', name: '张三' },
  })
  student: { id: string; name: string };
}

export class RandomPickEnvelopeDto {
  @ApiProperty({ type: RandomPickResponseDto })
  data: RandomPickResponseDto;
}
