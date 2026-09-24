import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../../app';

const base = '/api/v1/classes/:classId/dormitories';

test('dormitory management and selected-member scoring routes are registered', () => {
  const routes = new Set(app.routes.map(({ method, path }) => `${method} ${path}`));
  for (const route of [
    `GET ${base}`,
    `POST ${base}`,
    `PATCH ${base}/:dormitoryId`,
    `DELETE ${base}/:dormitoryId`,
    `POST ${base}/:dormitoryId/members`,
    `DELETE ${base}/:dormitoryId/members/:studentId`,
    `POST ${base}/:dormitoryId/score-events`,
  ]) {
    assert.ok(routes.has(route), `missing route: ${route}`);
  }
});

test('dormitory scoring cannot be called without a teacher token', async () => {
  const response = await app.handle(
    new Request('http://localhost/api/v1/classes/class-1/dormitories/dorm-1/score-events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        studentIds: ['student-1'],
        delta: 2,
        reason: '寝室卫生',
        businessKey: 'test-request-1',
      }),
    }),
  );
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, 'UNAUTHORIZED');
});
