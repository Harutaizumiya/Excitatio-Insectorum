import { Elysia, t } from 'elysia';
import { TeacherRole } from '@prisma/client';
import { schedulesService, type SaveScheduleInput } from './schedules.service';
import { authPlugin } from '../../plugins/auth';
import { studentsService } from '../students/students.service';

export const schedulesController = new Elysia({ prefix: '/classes/:classId/schedule' })
  .use(authPlugin)
  .get(
    '',
    async ({ user, params: { classId } }) => {
      await studentsService.assertAccess(user!.sub, classId);
      const data = await schedulesService.get(classId);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      detail: { summary: '获取班级课表与作息模板', tags: ['Schedules'] },
    },
  )
  .put(
    '',
    async ({ user, params: { classId }, body }) => {
      await studentsService.assertAccess(user!.sub, classId, [TeacherRole.HEAD_TEACHER]);
      const data = await schedulesService.save(user!.sub, classId, body as unknown as SaveScheduleInput);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      body: t.Object({
        activeTemplateId: t.Optional(t.Union([t.String(), t.Null()])),
        templates: t.Array(
          t.Object({
            id: t.Optional(t.String()),
            name: t.String(),
            periods: t.Array(
              t.Object({
                periodNo: t.Integer(),
                startTime: t.String(),
                endTime: t.String(),
              }),
            ),
          }),
        ),
        entries: t.Array(
          t.Object({
            weekday: t.Integer(),
            periodNo: t.Integer(),
            courseName: t.String(),
            classTeacherId: t.Optional(t.Union([t.String(), t.Null()])),
          }),
        ),
      }),
      detail: { summary: '保存班级课表与作息模板', tags: ['Schedules'] },
    },
  );
