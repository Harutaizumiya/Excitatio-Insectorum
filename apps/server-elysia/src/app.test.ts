import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from './app';

test('health endpoint keeps the standard API envelope', async () => {
  const response = await app.handle(new Request('http://localhost/api/v1/health'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-served-by'), 'Elysia');
  const body = (await response.json()) as { data: { status: string; service: string } };
  assert.equal(body.data.status, 'ok');
  assert.equal(body.data.service, 'Excitatio Insectorum Elysia Server');
});

test('protected routes preserve the standard unauthorized envelope', async () => {
  const response = await app.handle(
    new Request('http://localhost/api/v1/classes/class-1/students'),
  );
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string; message: string; requestId: string };
  assert.equal(body.code, 'UNAUTHORIZED');
  assert.ok(body.message);
  assert.ok(body.requestId);
});

test('invitation preview is public but rejects an unknown invitation token', async () => {
  const response = await app.handle(
    new Request('http://localhost/api/v1/auth/invitations/unknown-token/preview'),
  );
  assert.equal(response.status, 404);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, 'INVITATION_NOT_FOUND');
});

for (const [method, path, requestBody] of [
  ['POST', '/api/v1/telemetry/events', { eventName: 'display.heartbeat', clientType: 'DISPLAY' }],
  [
    'POST',
    '/api/v1/classes/class-1/feedback',
    { type: 'BUG', description: '测试反馈', clientType: 'ADMIN_WEB' },
  ],
  ['GET', '/api/v1/classes/class-1/analytics/summary', undefined],
] as const) {
  test(`${method} ${path} requires authentication`, async () => {
    const response = await app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: requestBody ? { 'content-type': 'application/json' } : undefined,
        body: requestBody ? JSON.stringify(requestBody) : undefined,
      }),
    );
    assert.equal(response.status, 401);
    const body = (await response.json()) as { code: string; requestId: string };
    assert.equal(body.code, 'UNAUTHORIZED');
    assert.ok(body.requestId);
  });
}
