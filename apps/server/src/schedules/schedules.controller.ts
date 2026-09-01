import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
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
import { SaveScheduleDto, ScheduleResponseDto, ScheduleResponseEnvelopeDto } from './dto';
import { SchedulesService } from './schedules.service';

@ApiTags('Schedules')
@ApiBearerAuth('access-token')
@Controller('classes/:classId/schedule')
@UseGuards(JwtAuthGuard, PrincipalTypeGuard, ClassAccessGuard, RoleGuard)
@RequirePrincipalTypes(PrincipalType.USER)
@ClassScope('classId')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  @RequireRoles(TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER)
  @ApiOperation({ summary: '获取班级课表与作息模板' })
  @ApiOkResponse({ type: ScheduleResponseEnvelopeDto })
  async get(@Param('classId') classId: string): Promise<{ data: ScheduleResponseDto }> {
    return { data: await this.schedules.get(classId) };
  }

  @Put()
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: '保存班级课表与作息模板' })
  @ApiOkResponse({ type: ScheduleResponseEnvelopeDto })
  async save(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Body() dto: SaveScheduleDto,
  ): Promise<{ data: ScheduleResponseDto }> {
    return {
      data: await this.schedules.save(request.user!.sub, classId, dto),
    };
  }
}
