import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TeacherRole } from '@prisma/client';
import { ClassAccessGuard, ClassScope, JwtAuthGuard, RequireRoles, RoleGuard } from '../common';
import { RandomPickDto, RandomPickEnvelopeDto, RandomPickResponseDto } from './dto/random-pick.dto';
import { RandomPickService } from './random-pick.service';

@ApiTags('Random Pick')
@ApiBearerAuth('access-token')
@Controller('classes/:classId/random-pick')
@UseGuards(JwtAuthGuard, ClassAccessGuard, RoleGuard)
@ClassScope()
@RequireRoles(TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER)
export class RandomPickController {
  constructor(private readonly randomPick: RandomPickService) {}

  @Post()
  @ApiOperation({ summary: '从本班 ACTIVE 且未排除的学生中随机点名' })
  @ApiResponse({ status: 201, type: RandomPickEnvelopeDto })
  @ApiResponse({ status: 409, description: 'RANDOM_PICK_NO_CANDIDATES' })
  async pick(
    @Param('classId') classId: string,
    @Body() input?: RandomPickDto,
  ): Promise<{ data: RandomPickResponseDto }> {
    return { data: await this.randomPick.pick(classId, input?.excludeStudentIds ?? []) };
  }
}
