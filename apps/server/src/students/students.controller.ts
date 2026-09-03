import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { ImportStudentsDto } from './import/dto/import-students.dto';
import { MAX_IMPORT_FILE_SIZE_BYTES, MAX_IMPORT_RECORDS } from './import/student-import.constants';
import { StudentImportService } from './import/student-import.service';
import { StudentsService } from './students.service';

@ApiTags('Students')
@ApiBearerAuth('access-token')
@Controller('classes/:classId/students')
@UseGuards(JwtAuthGuard, PrincipalTypeGuard, ClassAccessGuard, RoleGuard)
@RequirePrincipalTypes(PrincipalType.USER)
@ClassScope()
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly studentImport: StudentImportService,
  ) {}

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

  @Post('import/parse')
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        mapping: {
          type: 'string',
          description: '可选 JSON，例如 {"name":"学生姓名","studentNo":null,"gender":"男女"}',
        },
      },
    },
  })
  @ApiOperation({ summary: '解析学生名单文件并返回预览' })
  async parseImport(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('mapping') mapping?: string,
  ) {
    return this.studentImport.parse(request.user!.sub, classId, file, mapping);
  }

  @Post('import')
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: `批量导入学生（最多 ${MAX_IMPORT_RECORDS} 条）` })
  async import(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Body() dto: ImportStudentsDto,
  ) {
    return this.studentImport.importStudents(request.user!.sub, classId, dto.students);
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

  @Post(':studentId/restore')
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: '恢复学生' })
  async restore(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
  ) {
    return { data: await this.students.restore(request.user!.sub, classId, studentId) };
  }

  @Post(':studentId/delete')
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: '软删除学生并从当前布局解除' })
  async delete(
    @Req() request: RequestContext,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
  ) {
    return { data: await this.students.delete(request.user!.sub, classId, studentId) };
  }
}
