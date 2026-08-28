import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
  CreateCustomScoreDto,
  CreateRuleScoreDto,
  ListScoreRecordsQueryDto,
  ScoreRecordDataResponseDto,
  ScoreRecordListResponseDto,
} from './dto';
import { ScoreRecordsService } from './score-records.service';

@ApiTags('Score Records')
@ApiBearerAuth('access-token')
@Controller('classes/:classId/scores')
@UseGuards(JwtAuthGuard, PrincipalTypeGuard, ClassAccessGuard, RoleGuard)
@RequirePrincipalTypes(PrincipalType.USER)
@RequireRoles(TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER)
@ClassScope('classId')
export class ScoreRecordsController {
  constructor(private readonly scoreRecords: ScoreRecordsService) {}

  @Post('rule')
  @ApiOperation({
    summary: '使用规则创建积分',
    description: '服务端复制规则当前 delta，不接受客户端分值。',
  })
  @ApiOkResponse({ type: ScoreRecordDataResponseDto })
  @ApiNotFoundResponse({ description: 'STUDENT_NOT_FOUND | SCORE_RULE_NOT_FOUND' })
  async createFromRule(
    @Param('classId') classId: string,
    @Req() request: RequestContext,
    @Body() dto: CreateRuleScoreDto,
  ) {
    return {
      data: await this.scoreRecords.createFromRule(classId, request.classAccess!.teacherId, dto),
    };
  }

  @Post('custom')
  @ApiOperation({
    summary: '创建自定义积分',
    description: 'delta 必须为非 0 整数，reason 去除首尾空白后至少 10 个字符。',
  })
  @ApiOkResponse({ type: ScoreRecordDataResponseDto })
  @ApiNotFoundResponse({ description: 'STUDENT_NOT_FOUND' })
  async createCustom(
    @Param('classId') classId: string,
    @Req() request: RequestContext,
    @Body() dto: CreateCustomScoreDto,
  ) {
    return {
      data: await this.scoreRecords.createCustom(classId, request.classAccess!.teacherId, dto),
    };
  }

  @Get()
  @ApiOperation({ summary: '分页查询班级积分流水' })
  @ApiOkResponse({ type: ScoreRecordListResponseDto })
  async list(@Param('classId') classId: string, @Query() query: ListScoreRecordsQueryDto) {
    return this.scoreRecords.list(classId, query);
  }

  @Post(':recordId/revert')
  @ApiOperation({
    summary: '撤销积分记录',
    description:
      '事务内锁定 NORMAL 原记录并创建唯一反向 REVERT；班主任可撤销本班任意记录，任课教师仅限本人记录。',
  })
  @ApiOkResponse({ type: ScoreRecordDataResponseDto })
  @ApiNotFoundResponse({ description: 'SCORE_RECORD_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SCORE_RECORD_ALREADY_REVERTED' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN_SCORE_REVERT' })
  async revert(
    @Param('classId') classId: string,
    @Param('recordId') recordId: string,
    @Req() request: RequestContext,
  ) {
    return {
      data: await this.scoreRecords.revert(classId, recordId, request.classAccess!.teacherId),
    };
  }
}
