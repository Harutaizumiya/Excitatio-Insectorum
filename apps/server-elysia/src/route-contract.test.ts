import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from './app';

test('Elysia exposes the complete versioned HTTP surface', () => {
  const routes = new Set(
    app.routes
      .map((route) => `${route.method} ${route.path}`)
      .filter((route) => route.includes('/api/v1/') && !route.endsWith('/health')),
  );

  assert.equal(routes.size, 62);
  for (const route of [
    'GET /api/v1/auth/invitations/:token/preview',
    'POST /api/v1/classes/:classId/score-events',
    'POST /api/v1/classes/:classId/score-periods/settle',
    'PUT /api/v1/classes/:classId/seat-layout',
    'PUT /api/v1/classes/:classId/schedule',
    'POST /api/v1/classes/:classId/display-devices/:deviceId/revoke',
    'POST /api/v1/telemetry/events',
    'POST /api/v1/classes/:classId/feedback',
    'GET /api/v1/classes/:classId/feedback',
    'GET /api/v1/classes/:classId/feedback/:feedbackId',
    'PATCH /api/v1/classes/:classId/feedback/:feedbackId',
    'GET /api/v1/classes/:classId/analytics/summary',
  ]) {
    assert.ok(routes.has(route), `missing route: ${route}`);
  }
});
