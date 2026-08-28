import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { CreateStudentDto } from './dto/create-student.dto';
import { ListStudentsQuery } from './dto/list-students.query';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

@ApiTags('Students')
@ApiBearerAuth('access-token')
@Controller('classes/:classId/students')
@UseGuards(JwtAuthGuard, PrincipalTypeGuard, ClassAccessGuard, RoleGuard)
@RequirePrincipalTypes(PrincipalType.USER)
@ClassScope()
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @ApiOperation({ summary: '分页查询班级学生' })
  async list(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Query() query: ListStudentsQuery,
  ) {
    const result = await this.students.list(request.user!.sub, classId, query);
    return { data: result.students, meta: result.meta };
  }

  @Post()
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: '新增学生' })
  async create(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Body() dto: CreateStudentDto,
  ) {
    return { data: await this.students.create(request.user!.sub, classId, dto) };
  }

  @Patch(':studentId')
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: '更新学生' })
  async update(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return { data: await this.students.update(request.user!.sub, classId, studentId, dto) };
  }

  @Post(':studentId/deactivate')
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: '停用学生并从当前布局解除' })
  async deactivate(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
  ) {
    return { data: await this.students.deactivate(request.user!.sub, classId, studentId) };
  }
}
