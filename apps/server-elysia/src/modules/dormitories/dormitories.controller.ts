import { Elysia, t } from 'elysia';
import { authPlugin } from '../../plugins/auth';
import { dormitoriesService } from './dormitories.service';

const classParams = t.Object({ classId: t.String() });
const dormitoryParams = t.Object({ classId: t.String(), dormitoryId: t.String() });

export const dormitoriesController = new Elysia({ prefix: '/classes/:classId/dormitories' })
  .use(authPlugin)
  .get(
    '',
    async ({ user, params: { classId } }) => ({
      data: await dormitoriesService.list(classId, user!.sub),
    }),
    {
      requireUser: true,
      params: classParams,
      detail: { summary: '查询本班寝室及在班成员', tags: ['Dormitories'] },
    },
  )
  .post(
    '',
    async ({ user, params: { classId }, body }) => ({
      data: await dormitoriesService.create(classId, user!.sub, body.name),
    }),
    {
      requireUser: true,
      params: classParams,
      body: t.Object({ name: t.String({ minLength: 1, maxLength: 100 }) }),
      detail: { summary: '创建本班寝室', tags: ['Dormitories'] },
    },
  )
  .patch(
    '/:dormitoryId',
    async ({ user, params: { classId, dormitoryId }, body }) => ({
      data: await dormitoriesService.rename(classId, dormitoryId, user!.sub, body.name),
    }),
    {
      requireUser: true,
      params: dormitoryParams,
      body: t.Object({ name: t.String({ minLength: 1, maxLength: 100 }) }),
      detail: { summary: '重命名本班寝室', tags: ['Dormitories'] },
    },
  )
  .delete(
    '/:dormitoryId',
    async ({ user, params: { classId, dormitoryId } }) => ({
      data: await dormitoriesService.remove(classId, dormitoryId, user!.sub),
    }),
    {
      requireUser: true,
      params: dormitoryParams,
      detail: { summary: '删除本班寝室并移出成员', tags: ['Dormitories'] },
    },
  )
  .post(
    '/:dormitoryId/members',
    async ({ user, params: { classId, dormitoryId }, body }) => ({
      data: await dormitoriesService.addMembers(classId, dormitoryId, user!.sub, body.studentIds),
    }),
    {
      requireUser: true,
      params: dormitoryParams,
      body: t.Object({ studentIds: t.Array(t.String(), { minItems: 1, uniqueItems: true }) }),
      detail: { summary: '分配本班在班学生到寝室，可从其他寝室转入', tags: ['Dormitories'] },
    },
  )
  .delete(
    '/:dormitoryId/members/:studentId',
    async ({ user, params: { classId, dormitoryId, studentId } }) => ({
      data: await dormitoriesService.removeMember(classId, dormitoryId, user!.sub, studentId),
    }),
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), dormitoryId: t.String(), studentId: t.String() }),
      detail: { summary: '从寝室移出学生', tags: ['Dormitories'] },
    },
  )
  .post(
    '/:dormitoryId/score-events',
    async ({ user, params: { classId, dormitoryId }, body }) => ({
      data: await dormitoriesService.score(classId, dormitoryId, user!.sub, body),
    }),
    {
      requireUser: true,
      params: dormitoryParams,
      body: t.Object({
        studentIds: t.Array(t.String(), { minItems: 1, uniqueItems: true }),
        delta: t.Union([
          t.Integer({ minimum: -10000, maximum: -1 }),
          t.Integer({ minimum: 1, maximum: 10000 }),
        ]),
        reason: t.String({ minLength: 1, maxLength: 200 }),
        businessKey: t.String({ minLength: 1, maxLength: 255 }),
      }),
      detail: { summary: '为勾选的当前寝室成员批量登记积分', tags: ['Dormitories'] },
    },
  );
