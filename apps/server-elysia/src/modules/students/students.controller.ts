import { Elysia, t } from 'elysia';
import { StudentGender, StudentStatus, TeacherRole } from '@prisma/client';
import { studentsService } from './students.service';
import { studentImportService } from './student-import.service';
import { authPlugin } from '../../plugins/auth';
import { BusinessError } from '../../plugins/error-handler';

export const studentsController = new Elysia({ prefix: '/classes/:classId/students' })
  .use(authPlugin)
  .get(
    '',
    async ({ user, params: { classId }, query }) => {
      const data = await studentsService.list(user!.sub, classId, {
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
        keyword: query.keyword,
        status: query.status as StudentStatus | undefined,
        includeDeleted: query.includeDeleted === 'true' || query.includeDeleted === '1',
      });
      return { data: data.students, meta: data.meta };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      query: t.Object({
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
        keyword: t.Optional(t.String()),
        status: t.Optional(t.String()),
        includeDeleted: t.Optional(t.String()),
      }),
      detail: { summary: '分页查询班级学生', tags: ['Students'] },
    },
  )
  .post(
    '/import/parse',
    async ({ user, params: { classId }, body }) => {
      await studentsService.assertAccess(user!.sub, classId, [TeacherRole.HEAD_TEACHER]);
      const file = body.file as File | undefined;
      if (!file) {
        throw new BusinessError('STUDENT_IMPORT_FILE_REQUIRED', '请上传文件', 400);
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const data = await studentImportService.parse(
        {
          originalname: file.name,
          buffer,
          size: file.size,
        },
        body.mapping,
      );
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      body: t.Object({
        file: t.File(),
        mapping: t.Optional(t.String()),
      }),
      detail: { summary: '解析学生名单文件并返回预览', tags: ['Students'] },
    },
  )
  .post(
    '/import',
    async ({ user, params: { classId }, body }) => {
      await studentsService.assertAccess(user!.sub, classId, ['HEAD_TEACHER']);
      const data = await studentImportService.importStudents(classId, body.students);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      body: t.Object({
        students: t.Array(
          t.Object({
            name: t.String(),
            studentNo: t.Optional(t.Union([t.String(), t.Null()])),
            gender: t.Optional(
              t.Union([
                t.Literal(StudentGender.MALE),
                t.Literal(StudentGender.FEMALE),
                t.Literal(StudentGender.UNKNOWN),
              ]),
            ),
          }),
        ),
      }),
      detail: { summary: '批量导入学生', tags: ['Students'] },
    },
  )
  .post(
    '',
    async ({ user, params: { classId }, body }) => {
      const data = await studentsService.create(user!.sub, classId, {
        name: body.name,
        studentNo: body.studentNo,
        gender: body.gender as StudentGender | undefined,
      });
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      body: t.Object({
        name: t.String(),
        studentNo: t.Optional(t.String()),
        gender: t.Optional(
          t.Union([
            t.Literal(StudentGender.MALE),
            t.Literal(StudentGender.FEMALE),
            t.Literal(StudentGender.UNKNOWN),
          ]),
        ),
      }),
      detail: { summary: '新增学生', tags: ['Students'] },
    },
  )
  .patch(
    '/:studentId',
    async ({ user, params: { classId, studentId }, body }) => {
      const data = await studentsService.update(user!.sub, classId, studentId, {
        name: body.name,
        studentNo: body.studentNo,
        gender: body.gender as StudentGender | undefined,
      });
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), studentId: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        studentNo: t.Optional(t.String()),
        gender: t.Optional(
          t.Union([
            t.Literal(StudentGender.MALE),
            t.Literal(StudentGender.FEMALE),
            t.Literal(StudentGender.UNKNOWN),
          ]),
        ),
      }),
      detail: { summary: '更新学生', tags: ['Students'] },
    },
  )
  .post(
    '/:studentId/deactivate',
    async ({ user, params: { classId, studentId } }) => {
      const data = await studentsService.deactivate(user!.sub, classId, studentId);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), studentId: t.String() }),
      detail: { summary: '停用学生并从当前布局解除', tags: ['Students'] },
    },
  )
  .post(
    '/:studentId/restore',
    async ({ user, params: { classId, studentId } }) => {
      const data = await studentsService.restore(user!.sub, classId, studentId);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), studentId: t.String() }),
      detail: { summary: '恢复学生', tags: ['Students'] },
    },
  )
  .post(
    '/:studentId/delete',
    async ({ user, params: { classId, studentId } }) => {
      const data = await studentsService.delete(user!.sub, classId, studentId);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), studentId: t.String() }),
      detail: { summary: '软删除学生并从当前布局解除', tags: ['Students'] },
    },
  );
