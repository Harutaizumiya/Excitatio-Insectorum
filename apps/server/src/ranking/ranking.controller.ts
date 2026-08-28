import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TeacherRole } from '@prisma/client';
import {
  ClassAccessGuard,
  ClassScope,
  JwtAuthGuard,
  PrincipalType,
  PrincipalTypeGuard,
  RequirePrincipalTypes,
  RequireRoles,
  RoleGuard,
} from '../common';
import { WeeklyRankingResponseDto } from './dto';
import { RankingService } from './ranking.service';

@ApiTags('Ranking')
@ApiBearerAuth('access-token')
@Controller('classes/:classId/ranking')
@UseGuards(JwtAuthGuard, PrincipalTypeGuard, ClassAccessGuard, RoleGuard)
@RequirePrincipalTypes(PrincipalType.USER)
@RequireRoles(TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER)
@ClassScope('classId')
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  @Get()
  @ApiOperation({
    summary: '查询本周 Top3 与周环比进步',
    description:
      '周边界固定为 UTC 周一 00:00，区间为 [startAt, endAt)；响应不包含任何 score 字段。',
  })
  @ApiOkResponse({ type: WeeklyRankingResponseDto })
  async getWeekly(@Param('classId') classId: string) {
    return { data: await this.ranking.getWeeklyRanking(classId) };
  }
}
