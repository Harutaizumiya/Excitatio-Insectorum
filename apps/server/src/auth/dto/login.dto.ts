import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'teacher01' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  account!: string;

  @ApiProperty({ example: 'change-me', format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
