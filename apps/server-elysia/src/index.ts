import { Elysia } from 'elysia';
import http from 'node:http';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { node } from '@elysiajs/node';
import { config } from './config';
import { applyErrorHandler, BusinessError } from './plugins/error-handler';
import { realtimeService } from './modules/realtime/realtime.service';

import { healthController } from './modules/health/health.controller';
import { authController } from './modules/auth/auth.controller';
import { classroomsController } from './modules/classrooms/classrooms.controller';
import { teachersController } from './modules/teachers/teachers.controller';
import { studentsController } from './modules/students/students.controller';
import { seatingController } from './modules/seating/seating.controller';
import { scoresController } from './modules/scores/scores.controller';
import { rankingController } from './modules/ranking/ranking.controller';
import { schedulesController } from './modules/schedules/schedules.controller';
import { randomPickController } from './modules/random-pick/random-pick.controller';
import { displaysController } from './modules/displays/displays.controller';

const isBun = typeof (globalThis as unknown as { Bun?: unknown }).Bun !== 'undefined';

let baseApp = new Elysia(isBun ? {} : { adapter: node() })
  .error({ BusinessError })
  .use(
    cors({
      origin: config.corsOrigins.length ? config.corsOrigins : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    }),
  )
  .onAfterHandle(({ set }) => {
    set.headers['X-Served-By'] = 'Elysia';
  });

// Swagger Documentation setup (aligned with Nest /api/docs)
if (config.swaggerEnabled) {
  baseApp = baseApp.use(
    swagger({
      path: '/api/docs',
      documentation: {
        info: {
          title: 'Excitatio Insectorum API',
          description: 'Classroom management backend API powered by Elysia.js',
          version: '1.0.0',
        },
        components: {
          securitySchemes: {
            'access-token': {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
    }),
  );
}

// All routes under /api/v1 prefix (100% compatible with Nest API contract)
export const app = baseApp.group('/api/v1', (group) =>
  applyErrorHandler(group)
    .use(healthController)
    .use(authController)
    .use(classroomsController)
    .use(teachersController)
    .use(studentsController)
    .use(seatingController)
    .use(scoresController)
    .use(rankingController)
    .use(schedulesController)
    .use(randomPickController)
    .use(displaysController),
);

// Dual-runtime server bootstrap (Bun and Node.js)
if (isBun) {
  // Under Bun, use native node:http wrapper so Socket.IO attaches smoothly
  const bunServer = http.createServer(async (req, res) => {
    if (req.url?.startsWith('/socket.io')) return;

    const url = `http://${req.headers.host || 'localhost'}${req.url}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        if (Array.isArray(value)) {
          value.forEach((v) => headers.append(key, v));
        } else {
          headers.set(key, value);
        }
      }
    }

    const method = req.method || 'GET';
    const hasBody = method !== 'GET' && method !== 'HEAD';

    const request = new Request(url, {
      method,
      headers,
      body: hasBody ? req : undefined,
      duplex: hasBody ? 'half' : undefined,
    } as RequestInit);

    const response = await app.handle(request);

    res.statusCode = response.status;
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    if (!response.body) {
      res.end();
      return;
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  });

  realtimeService.attach(bunServer);

  bunServer.listen(config.port, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bunVersion = (globalThis as any).Bun?.version || 'unknown';
    console.log(`🚀 Elysia standalone server running on Bun at http://localhost:${config.port}`);
    if (config.swaggerEnabled) {
      console.log(`📖 Swagger docs available at http://localhost:${config.port}/api/docs`);
    }
    console.log(`⚡ Runtime engine: Bun (v${bunVersion})`);
  });
} else {
  // Under Node.js
  app.listen(config.port, (server) => {
    const nodeServer =
      (server as unknown as { node?: { server?: import('node:http').Server } })?.node?.server ||
      (server as unknown as { raw?: { node?: { server?: import('node:http').Server } } })?.raw?.node
        ?.server;
    if (nodeServer) {
      realtimeService.attach(nodeServer);
    }

    console.log(
      `🚀 Elysia standalone server running on Node.js at http://localhost:${config.port}`,
    );
    if (config.swaggerEnabled) {
      console.log(`📖 Swagger docs available at http://localhost:${config.port}/api/docs`);
    }
    console.log(`⚡ Runtime engine: Node.js (${process.version})`);
  });
}
