import { Elysia, t } from 'elysia';
import { UsageClientType, UsageEventResult } from '@prisma/client';
import { authPlugin } from '../../plugins/auth';
import { telemetryService } from './telemetry.service';

export const telemetryController = new Elysia({ prefix: '/telemetry' }).use(authPlugin).post(
  '/events',
  async ({ body, principal, request, status }) => {
    const data = await telemetryService.record(
      {
        ...body,
        clientType: body.clientType as UsageClientType,
        result: body.result as UsageEventResult | undefined,
        traceId: body.traceId || request.headers.get('x-request-id') || undefined,
      },
      principal!,
    );
    return status(202, { data });
  },
  {
    requireAuth: true,
    body: t.Object({
      eventName: t.String({ minLength: 1, maxLength: 100, pattern: '^[a-z0-9][a-z0-9_.-]*$' }),
      clientType: t.String({ enum: Object.values(UsageClientType) }),
      classId: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
      result: t.Optional(t.String({ enum: Object.values(UsageEventResult) })),
      module: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
      page: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
      appVersion: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
      browser: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      traceId: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
      errorCode: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
      properties: t.Optional(t.Record(t.String(), t.Any())),
      occurredAt: t.Optional(t.String({ format: 'date-time' })),
    }),
    detail: {
      summary: '上报统一使用或异常事件',
      tags: ['Telemetry'],
      security: [{ 'access-token': [] }],
    },
  },
);
