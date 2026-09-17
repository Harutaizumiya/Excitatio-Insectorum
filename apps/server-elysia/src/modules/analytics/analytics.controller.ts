import { Elysia, t } from 'elysia';
import { authPlugin } from '../../plugins/auth';
import { analyticsService, parseAnalyticsRange } from './analytics.service';

export const analyticsController = new Elysia({ prefix: '/classes/:classId/analytics' })
  .use(authPlugin)
  .get(
    '/summary',
    async ({ user, params: { classId }, query }) => ({
      data: await analyticsService.getClassSummary(
        classId,
        user!.sub,
        parseAnalyticsRange(query.from, query.to),
      ),
    }),
    {
      requireUser: true,
      params: t.Object({ classId: t.String({ minLength: 1, maxLength: 100 }) }),
      query: t.Object({
        from: t.Optional(t.String({ format: 'date-time' })),
        to: t.Optional(t.String({ format: 'date-time' })),
      }),
      detail: {
        summary: '查看本班使用分析摘要',
        tags: ['Analytics'],
        security: [{ 'access-token': [] }],
      },
    },
  );
