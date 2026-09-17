import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { node } from '@elysiajs/node';
import { config } from './config';
import { applyErrorHandler, BusinessError } from './plugins/error-handler';

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
import { telemetryController } from './modules/telemetry/telemetry.controller';
import { feedbackController } from './modules/feedback/feedback.controller';
import { analyticsController } from './modules/analytics/analytics.controller';

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
    .use(displaysController)
    .use(telemetryController)
    .use(feedbackController)
    .use(analyticsController),
);
