import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
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
  type RequestContext,
} from '../common';
import {
  CommitteeListResponseDto,
  CreateScoreEventDto,
  ScoreEventResponseDto,
  ScorePeriodSummaryDto,
  ScorePeriodSummaryQueryDto,
  SettleScorePeriodDto,
  UpdateCommitteeDto,
} from './dto';
import { ScoreCommitteeService } from './score-committee.service';
import { ScoreEventsService } from './score-events.service';
import { ScorePeriodsService } from './score-periods.service';

@ApiTags('Score Periods')
@ApiBearerAuth('access-token')
@Controller('classes/:classId')
@UseGuards(JwtAuthGuard, PrincipalTypeGuard, ClassAccessGuard, RoleGuard)
@RequirePrincipalTypes(PrincipalType.USER)
@RequireRoles(TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER)
@ClassScope('classId')
export class ScorePeriodsController {
  constructor(
    private readonly periods: ScorePeriodsService,
    private readonly events: ScoreEventsService,
    private readonly committee: ScoreCommitteeService,
  ) {}

  @Post('score-events')
  @ApiOperation({ summary: '登记结构化积分事件' })
  @ApiOkResponse({ type: ScoreEventResponseDto })
  async createEvent(
    @Param('classId') classId: string,
    @Req() request: RequestContext,
    @Body() dto: CreateScoreEventDto,
  ) {
    return { data: await this.events.create(classId, request.classAccess!.teacherId, dto) };
  }

  @Get('score-periods/current/summary')
  @ApiOperation({ summary: '查询当前积分周期汇总' })
  @ApiOkResponse({ type: ScorePeriodSummaryDto })
  async currentSummary(@Param('classId') classId: string, @Req() request: RequestContext) {
    return {
      data: await this.periods.getCurrentSummary(classId, request.classAccess!.teacherId),
    };
  }

  @Get('score-periods/summary')
  @ApiOperation({ summary: '查询积分周期或日期范围汇总' })
  @ApiOkResponse({ type: ScorePeriodSummaryDto })
  async summary(
    @Param('classId') classId: string,
    @Req() request: RequestContext,
    @Query() query: ScorePeriodSummaryQueryDto,
  ) {
    return {
      data: await this.periods.getSummary(
        classId,
        request.classAccess!.teacherId,
        query.from,
        query.to,
      ),
    };
  }

  @Get('committee')
  @ApiOperation({ summary: '查询班委名单' })
  @ApiOkResponse({ type: CommitteeListResponseDto })
  async listCommittee(@Param('classId') classId: string) {
    return { data: await this.committee.list(classId) };
  }

  @Put('committee')
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: '更新班委名单' })
  @ApiOkResponse({ type: CommitteeListResponseDto })
  async replaceCommittee(@Param('classId') classId: string, @Body() dto: UpdateCommitteeDto) {
    return { data: await this.committee.replace(classId, dto) };
  }

  @Post('score-periods/settle')
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: '结算积分周期' })
  async settle(
    @Param('classId') classId: string,
    @Req() request: RequestContext,
    @Body() dto: SettleScorePeriodDto,
  ) {
    if (dto.periodId) {
      await this.periods.settlePeriod(classId, dto.periodId, request.classAccess!.teacherId);
    } else {
      await this.periods.settleBeforeCurrent(classId, request.classAccess!.teacherId);
    }
    return { data: { settled: true } };
  }
}
