import { Elysia, t } from 'elysia';

export const healthController = new Elysia({ prefix: '/health' }).get(
  '',
  () => {
    const isBun = typeof (globalThis as unknown as { Bun?: unknown }).Bun !== 'undefined';
    return {
      data: {
        status: 'ok',
        service: 'Excitatio Insectorum Elysia Server',
        runtime: isBun ? 'bun' : `node ${process.version}`,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    };
  },
  {
    detail: {
      summary: '系统健康检查探针',
      tags: ['Health'],
    },
    response: t.Object({
      data: t.Object({
        status: t.String(),
        service: t.String(),
        runtime: t.String(),
        timestamp: t.String(),
        uptime: t.Number(),
      }),
    }),
  },
);
