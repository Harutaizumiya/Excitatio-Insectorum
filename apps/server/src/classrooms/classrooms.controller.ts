import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
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
import { ClassroomsService } from './classrooms.service';
import { UpdateClassroomDto } from './dto/update-classroom.dto';

@ApiTags('Classrooms')
@ApiBearerAuth('access-token')
@Controller('classes')
@UseGuards(JwtAuthGuard, PrincipalTypeGuard, ClassAccessGuard, RoleGuard)
@RequirePrincipalTypes(PrincipalType.USER)
export class ClassroomsController {
  constructor(private readonly classrooms: ClassroomsService) {}

  @Get()
  @ApiOperation({ summary: '列出当前用户可访问班级' })
  async list(@Req() request: RequestContext) {
    return { data: await this.classrooms.listForUser(request.user!.sub) };
  }

  @Get(':classId')
  @ClassScope()
  @ApiOperation({ summary: '获取班级详情' })
  async get(@Req() request: RequestContext, @Param('classId') classId: string) {
    return { data: await this.classrooms.get(request.user!.sub, classId) };
  }

  @Patch(':classId')
  @ClassScope()
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: '更新班级基础信息与网格' })
  async update(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Body() dto: UpdateClassroomDto,
  ) {
    return { data: await this.classrooms.update(request.user!.sub, classId, dto) };
  }
}
