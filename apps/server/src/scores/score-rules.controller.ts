import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
  PrincipalType as JwtPrincipalType,
  PrincipalTypeGuard,
  RequirePrincipalTypes,
  RequireRoles,
  RoleGuard,
  type RequestContext,
} from '../common';
import {
  CreateScoreRuleDto,
  ListScoreRulesQueryDto,
  ScoreRuleDataResponseDto,
  ScoreRuleListResponseDto,
  UpdateScoreRuleDto,
} from './dto';
import { ScoreRulesService } from './score-rules.service';

@ApiTags('Score Rules')
@ApiBearerAuth('access-token')
@Controller('classes/:classId/score-rules')
@UseGuards(JwtAuthGuard, PrincipalTypeGuard, ClassAccessGuard, RoleGuard)
@RequirePrincipalTypes(JwtPrincipalType.USER)
@RequireRoles(TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER)
@ClassScope('classId')
export class ScoreRulesController {
  constructor(private readonly scoreRules: ScoreRulesService) {}

  @Get()
  @ApiOperation({ summary: '查询班级积分规则' })
  @ApiOkResponse({ type: ScoreRuleListResponseDto })
  async list(@Param('classId') classId: string, @Query() query: ListScoreRulesQueryDto) {
    return { data: await this.scoreRules.list(classId, query) };
  }

  @Post()
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: '创建积分规则', description: '仅班主任可操作；delta 必须为非 0 整数。' })
  @ApiOkResponse({ type: ScoreRuleDataResponseDto })
  @ApiForbiddenResponse({ description: 'FORBIDDEN_ROLE' })
  async create(
    @Param('classId') classId: string,
    @Req() request: RequestContext,
    @Body() dto: CreateScoreRuleDto,
  ) {
    return { data: await this.scoreRules.create(classId, request.classAccess!.teacherId, dto) };
  }

  @Patch(':ruleId')
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: '更新积分规则', description: '仅班主任可操作。' })
  @ApiOkResponse({ type: ScoreRuleDataResponseDto })
  @ApiNotFoundResponse({ description: 'SCORE_RULE_NOT_FOUND' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN_ROLE' })
  async update(
    @Param('classId') classId: string,
    @Param('ruleId') ruleId: string,
    @Req() request: RequestContext,
    @Body() dto: UpdateScoreRuleDto,
  ) {
    return {
      data: await this.scoreRules.update(classId, ruleId, request.classAccess!.teacherId, dto),
    };
  }

  @Post(':ruleId/disable')
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: '停用积分规则', description: '仅班主任可操作。' })
  @ApiOkResponse({ type: ScoreRuleDataResponseDto })
  @ApiNotFoundResponse({ description: 'SCORE_RULE_NOT_FOUND' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN_ROLE' })
  @ApiConflictResponse({ description: '保留给并发状态冲突' })
  async disable(
    @Param('classId') classId: string,
    @Param('ruleId') ruleId: string,
    @Req() request: RequestContext,
  ) {
    return {
      data: await this.scoreRules.disable(classId, ruleId, request.classAccess!.teacherId),
    };
  }
}
