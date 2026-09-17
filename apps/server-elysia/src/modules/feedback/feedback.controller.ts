import { Elysia, t } from 'elysia';
import { FeedbackStatus, FeedbackType, UsageClientType } from '@prisma/client';
import { authPlugin } from '../../plugins/auth';
import { feedbackService } from './feedback.service';

const classParams = t.Object({ classId: t.String({ minLength: 1, maxLength: 100 }) });
const feedbackParams = t.Object({
  classId: t.String({ minLength: 1, maxLength: 100 }),
  feedbackId: t.String({ minLength: 1, maxLength: 100 }),
});

export const feedbackController = new Elysia({ prefix: '/classes/:classId/feedback' })
  .use(authPlugin)
  .post(
    '',
    async ({ user, params: { classId }, body, request, status }) => {
      const data = await feedbackService.create(classId, user!.sub, {
        ...body,
        type: body.type as FeedbackType,
        clientType: body.clientType as UsageClientType,
        traceId: body.traceId || request.headers.get('x-request-id') || undefined,
      });
      return status(201, { data });
    },
    {
      requireUser: true,
      params: classParams,
      body: t.Object({
        type: t.String({ enum: Object.values(FeedbackType) }),
        description: t.String({ minLength: 1, maxLength: 5000 }),
        screenshotUrl: t.Optional(t.String({ minLength: 1, maxLength: 1000 })),
        clientType: t.String({ enum: Object.values(UsageClientType) }),
        module: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
        page: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        appVersion: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
        browser: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        traceId: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
      }),
      detail: {
        summary: '提交班主任反馈',
        tags: ['Feedback'],
        security: [{ 'access-token': [] }],
      },
    },
  )
  .get(
    '',
    async ({ user, params: { classId }, query }) =>
      feedbackService.list(classId, user!.sub, {
        status: query.status as FeedbackStatus | undefined,
        type: query.type as FeedbackType | undefined,
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      }),
    {
      requireUser: true,
      params: classParams,
      query: t.Object({
        status: t.Optional(t.String({ enum: Object.values(FeedbackStatus) })),
        type: t.Optional(t.String({ enum: Object.values(FeedbackType) })),
        page: t.Optional(t.String({ pattern: '^[1-9][0-9]*$' })),
        pageSize: t.Optional(t.String({ pattern: '^[1-9][0-9]*$' })),
      }),
      detail: {
        summary: '列出本班反馈',
        tags: ['Feedback'],
        security: [{ 'access-token': [] }],
      },
    },
  )
  .get(
    '/:feedbackId',
    async ({ user, params: { classId, feedbackId } }) => ({
      data: await feedbackService.get(classId, feedbackId, user!.sub),
    }),
    {
      requireUser: true,
      params: feedbackParams,
      detail: {
        summary: '查看本班反馈详情',
        tags: ['Feedback'],
        security: [{ 'access-token': [] }],
      },
    },
  )
  .patch(
    '/:feedbackId',
    async ({ user, params: { classId, feedbackId }, body }) => ({
      data: await feedbackService.update(classId, feedbackId, user!.sub, {
        ...body,
        status: body.status as FeedbackStatus | undefined,
      }),
    }),
    {
      requireUser: true,
      params: feedbackParams,
      body: t.Object({
        status: t.Optional(t.String({ enum: Object.values(FeedbackStatus) })),
        processingNote: t.Optional(t.String({ maxLength: 2000 })),
      }),
      detail: {
        summary: '更新本班反馈状态或处理备注',
        tags: ['Feedback'],
        security: [{ 'access-token': [] }],
      },
    },
  );
