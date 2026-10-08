import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from './app';

test('Elysia exposes the complete versioned HTTP surface', () => {
  const routes = new Set(
    app.routes
      .map((route) => `${route.method} ${route.path}`)
      .filter((route) => route.includes('/api/v1/') && !route.endsWith('/health')),
  );

  assert.equal(routes.size, 85);
  for (const route of [
    'GET /api/v1/auth/invitations/:token/preview',
    'POST /api/v1/auth/wechat/login',
    'POST /api/v1/auth/wechat/bind',
    'GET /api/v1/auth/wechat/invitations/:token/preview',
    'POST /api/v1/classes/:classId/teachers/:classTeacherId/wechat-invitations',
    'POST /api/v1/classes/:classId/teachers/:classTeacherId/wechat-invitations/revoke',
    'GET /api/v1/classes/:classId/score-events/by-key/:businessKey',
    'POST /api/v1/classes/:classId/score-events',
    'GET /api/v1/classes/:classId/dormitories',
    'POST /api/v1/classes/:classId/dormitories',
    'PATCH /api/v1/classes/:classId/dormitories/:dormitoryId',
    'DELETE /api/v1/classes/:classId/dormitories/:dormitoryId',
    'POST /api/v1/classes/:classId/dormitories/:dormitoryId/members',
    'DELETE /api/v1/classes/:classId/dormitories/:dormitoryId/members/:studentId',
    'POST /api/v1/classes/:classId/dormitories/:dormitoryId/score-events',
    'PUT /api/v1/classes/:classId/seat-layout',
    'PUT /api/v1/classes/:classId/schedule',
    'POST /api/v1/classes/:classId/display-devices/:deviceId/revoke',
    'POST /api/v1/telemetry/events',
    'POST /api/v1/classes/:classId/feedback',
    'GET /api/v1/classes/:classId/feedback',
    'GET /api/v1/classes/:classId/feedback/:feedbackId',
    'PATCH /api/v1/classes/:classId/feedback/:feedbackId',
    'GET /api/v1/classes/:classId/analytics/summary',
    'POST /api/v1/classes/:classId/announcements',
    'GET /api/v1/classes/:classId/announcements',
    'GET /api/v1/classes/:classId/announcements/by-key/:idempotencyKey',
    'POST /api/v1/classes/:classId/announcements/:id/end',
    'GET /api/v1/display/announcements/current',
    'POST /api/v1/display/announcements/:id/displayed',
    'POST /api/v1/display/announcements/:id/reply',
  ]) {
    assert.ok(routes.has(route), `missing route: ${route}`);
  }
});
