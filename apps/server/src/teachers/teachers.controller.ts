import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeachersService } from './teachers.service';

@ApiTags('Teachers')
@ApiBearerAuth('access-token')
@Controller('classes/:classId/teachers')
@UseGuards(JwtAuthGuard, PrincipalTypeGuard, ClassAccessGuard, RoleGuard)
@RequirePrincipalTypes(PrincipalType.USER)
@ClassScope()
@RequireRoles(TeacherRole.HEAD_TEACHER)
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @ApiOperation({ summary: '列出班级教师关系' })
  async list(@Req() request: RequestContext, @Param('classId') classId: string) {
    return { data: await this.teachers.list(request.user!.sub, classId) };
  }

  @Post()
  @ApiOperation({ summary: '创建任课教师' })
  async create(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Body() dto: CreateTeacherDto,
  ) {
    return { data: await this.teachers.create(request.user!.sub, classId, dto) };
  }

  @Patch(':classTeacherId')
  @ApiOperation({ summary: '更新任课教师姓名或科目' })
  async update(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Param('classTeacherId') classTeacherId: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    return {
      data: await this.teachers.update(request.user!.sub, classId, classTeacherId, dto),
    };
  }

  @Post(':classTeacherId/revoke')
  @ApiOperation({ summary: '撤销任课教师关系并吊销会话' })
  async revoke(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Param('classTeacherId') classTeacherId: string,
  ) {
    await this.teachers.revoke(request.user!.sub, classId, classTeacherId);
    return { data: { revoked: true } };
  }

  @Post(':classTeacherId/restore')
  @ApiOperation({ summary: '恢复已撤销的任课教师关系' })
  async restore(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Param('classTeacherId') classTeacherId: string,
  ) {
    await this.teachers.restore(request.user!.sub, classId, classTeacherId);
    return { data: { restored: true } };
  }

  @Post(':classTeacherId/invitations')
  @ApiOperation({ summary: '生成一次性教师邀请' })
  async createInvitation(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Param('classTeacherId') classTeacherId: string,
  ) {
    return {
      data: await this.teachers.createInvitation(request.user!.sub, classId, classTeacherId),
    };
  }
}
