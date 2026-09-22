import { Elysia, t } from 'elysia';
import { TeacherRole } from '@prisma/client';
import { seatingService, type SeatLayoutSeatInput } from './seating.service';
import { authPlugin } from '../../plugins/auth';
import { studentsService } from '../students/students.service';

export const seatingController = new Elysia({ prefix: '/classes/:classId/seat-layout' })
  .use(authPlugin)
  .get(
    '',
    async ({ user, params: { classId } }) => {
      await studentsService.assertAccess(user!.sub, classId);
      const data = await seatingService.getCurrentLayout(classId);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      detail: { summary: '获取班级当前座位布局', tags: ['Seat Layout'] },
    },
  )
  .put(
    '',
    async ({ user, params: { classId }, body }) => {
      await studentsService.assertAccess(user!.sub, classId, [TeacherRole.HEAD_TEACHER]);
      const data = await seatingService.saveLayout(classId, user!.sub, {
        gridRows: body.gridRows,
        gridCols: body.gridCols,
        baseVersion: body.baseVersion,
        seats: body.seats as unknown as SeatLayoutSeatInput[],
      });
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      body: t.Object({
        gridRows: t.Optional(t.Integer({ minimum: 1, maximum: 20 })),
        gridCols: t.Optional(t.Integer({ minimum: 1, maximum: 20 })),
        baseVersion: t.Optional(t.Integer({ minimum: 0 })),
        seats: t.Array(
          t.Object({
            row: t.Integer({ minimum: 0 }),
            col: t.Integer({ minimum: 0 }),
            studentId: t.Optional(t.Union([t.String(), t.Null()])),
            cellType: t.Optional(
              t.Union([
                t.Literal('seat'),
                t.Literal('aisle'),
                t.Literal('podium'),
                t.Literal('empty'),
              ]),
            ),
          }),
        ),
      }),
      detail: { summary: '保存全量座位布局新版本', tags: ['Seat Layout'] },
    },
  )
  .get(
    '/versions',
    async ({ user, params: { classId }, query }) => {
      await studentsService.assertAccess(user!.sub, classId, [TeacherRole.HEAD_TEACHER]);
      const data = await seatingService.listVersions(
        classId,
        query.page ? Number(query.page) : 1,
        query.pageSize ? Number(query.pageSize) : 20,
      );
      return data;
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      query: t.Object({
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
      detail: { summary: '查询历史座位版本列表', tags: ['Seat Layout'] },
    },
  )
  .get(
    '/versions/:versionId',
    async ({ user, params: { classId, versionId } }) => {
      await studentsService.assertAccess(user!.sub, classId, [TeacherRole.HEAD_TEACHER]);
      const data = await seatingService.getVersion(classId, versionId);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), versionId: t.String() }),
      detail: { summary: '预览历史座位版本快照', tags: ['Seat Layout'] },
    },
  )
  .post(
    '/versions/:versionId/restore',
    async ({ user, params: { classId, versionId } }) => {
      await studentsService.assertAccess(user!.sub, classId, [TeacherRole.HEAD_TEACHER]);
      const data = await seatingService.restoreVersion(classId, versionId, user!.sub);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), versionId: t.String() }),
      detail: { summary: '将历史座位版本恢复为最新版本', tags: ['Seat Layout'] },
    },
  );
