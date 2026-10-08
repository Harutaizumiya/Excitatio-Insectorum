import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// HTTP contract tests must not depend on, or migrate, the developer's database.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const testDirectory = await mkdtemp(join(tmpdir(), 'excitatio-http-contract-'));
process.env.DATABASE_URL = `file:${join(testDirectory, 'contract.db').replaceAll('\\', '/')}`;
execFileSync(
  process.execPath,
  [
    resolve(repositoryRoot, 'packages/database/scripts/run-sqlite-prisma.mjs'),
    'migrate',
    'deploy',
    '--schema',
    resolve(repositoryRoot, 'packages/database/prisma/sqlite/schema.prisma'),
  ],
  { cwd: repositoryRoot, env: process.env, stdio: 'pipe' },
);
const { app } = await import('./app');
const { prisma } = await import('./plugins/prisma');
after(async () => {
  await prisma.$disconnect();
  if (dirname(resolve(testDirectory)) !== resolve(tmpdir()))
    throw new Error('Invalid test directory');
  await rm(testDirectory, { recursive: true, force: true });
});

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
