import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import type { PrismaClient as PrismaClientType } from '@prisma/client';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = resolve(serverRoot, '../..');
const databasePackageRoot = resolve(repoRoot, 'packages/database');
const sqliteSchema = resolve(databasePackageRoot, 'prisma/sqlite/schema.prisma');
const sqliteRunner = resolve(databasePackageRoot, 'scripts/run-sqlite-prisma.mjs');
const tempRoot = await mkdtemp(join(tmpdir(), 'excitatio-wechat-auth-'));
const databaseFile = join(tempRoot, 'auth-test.db');
const databaseUrl = `file:${databaseFile.replaceAll('\\', '/')}`;

process.env.DATABASE_URL = databaseUrl;
process.env.WECHAT_ENABLED = 'true';
process.env.WECHAT_APP_ID = 'wechat-test-app';
process.env.WECHAT_APP_SECRET = 'test-secret';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-with-enough-entropy';

const migration = execFileSync(
  process.execPath,
  [sqliteRunner, 'migrate', 'deploy', '--schema', sqliteSchema],
  {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
  },
);
void migration;

const [
  { PrismaClient },
  prismaTypes,
  { AuthService },
  { config },
  { BusinessError },
  { replacePendingTeacherInvitation },
  { prisma: globalPrisma },
  { Elysia },
  { applyErrorHandler },
  { teachersController },
] = await Promise.all([
  import('@repo/database'),
  import('@prisma/client'),
  import('./auth.service'),
  import('../../config'),
  import('../../plugins/error-handler'),
  import('../teachers/teachers.controller'),
  import('../../plugins/prisma'),
  import('elysia'),
  import('../../plugins/error-handler'),
  import('../teachers/teachers.controller'),
]);

const database = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const now = Date.now;
const appId = 'wechat-test-app';
const settings = {
  ...config,
  wechatEnabled: true,
  wechatAppId: appId,
  wechatAppSecret: 'test-secret',
  wechatRequestTimeoutMs: 100,
  wechatBindingTicketExpiresInSeconds: 300,
  jwtAccessSecret: 'test-access-secret-with-enough-entropy',
  jwtRefreshSecret: 'test-refresh-secret-with-enough-entropy',
};

interface SeededInvitation {
  classId: string;
  classTeacherId: string;
  headTeacherId: string;
  teacherId: string;
  headAccount: string;
  webToken: string;
  wechatToken: string;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function seedInvitation(): Promise<SeededInvitation> {
  const suffix = randomUUID();
  const classroom = await database.classroom.create({ data: { name: `班级-${suffix}` } });
  const head = await database.user.create({
    data: { name: `班主任-${suffix}`, account: `head-${suffix}`, passwordHash: 'unused' },
  });
  const teacher = await database.user.create({
    data: { name: `任课教师-${suffix}`, account: `teacher-${suffix}`, passwordHash: 'unused' },
  });
  await database.classTeacher.create({
    data: { classId: classroom.id, teacherId: head.id, role: 'HEAD_TEACHER' },
  });
  const relation = await database.classTeacher.create({
    data: {
      classId: classroom.id,
      teacherId: teacher.id,
      role: 'SUBJECT_TEACHER',
      subject: '数学',
    },
  });
  const webToken = randomBytes(24).toString('base64url');
  const wechatToken = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 60_000);
  await database.teacherInvitation.createMany({
    data: [
      {
        classTeacherId: relation.id,
        tokenHash: hash(webToken),
        expiresAt,
        purpose: 'WEB_ACTIVATION',
      },
      {
        classTeacherId: relation.id,
        tokenHash: hash(wechatToken),
        expiresAt,
        purpose: 'WECHAT_BINDING',
      },
    ],
  });
  return {
    classId: classroom.id,
    classTeacherId: relation.id,
    headTeacherId: head.id,
    teacherId: teacher.id,
    headAccount: `head-${suffix}`,
    webToken,
    wechatToken,
  };
}

function serviceFor(openIdForCode: (code: string) => string = (code) => `openid-${code}`) {
  return new AuthService(
    database,
    settings,
    async (code) => ({ appId, openId: openIdForCode(code) }),
    async () => 'data:image/png;base64,iVBORw0KGgo=',
  );
}

async function assertBusinessError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    return error instanceof BusinessError && error.code === code;
  });
}

after(async () => {
  await Promise.all([database.$disconnect(), globalPrisma.$disconnect()]);
  const resolvedTempRoot = resolve(tempRoot);
  if (dirname(resolvedTempRoot) !== resolve(tmpdir())) {
    throw new Error('Refusing to remove a path outside the temporary directory');
  }
  await rm(resolvedTempRoot, { recursive: true, force: true });
});

test('WeChat code exchange sanitizes HTTP, errcode, and timeout failures without storing tickets', async () => {
  const originalFetch = globalThis.fetch;
  const cases: Array<{ code: string; fetch: typeof fetch; timeoutMs?: number }> = [
    {
      code: 'http-failure-code',
      fetch: (async () =>
        Response.json(
          {
            openid: 'secret-openid-http',
            session_key: 'secret-session-http',
          },
          { status: 503 },
        )) as typeof fetch,
    },
    {
      code: 'invalid-wechat-code',
      fetch: (async () =>
        Response.json({
          errcode: 40029,
          errmsg: 'invalid code with secret-openid-errcode and secret-session-errcode',
          openid: 'secret-openid-errcode',
          session_key: 'secret-session-errcode',
        })) as typeof fetch,
    },
    {
      code: 'timeout-code',
      timeoutMs: 5,
      fetch: ((_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error('timeout secret-openid-timeout secret-session-timeout')),
            { once: true },
          );
        })) as typeof fetch,
    },
  ];

  try {
    for (const failure of cases) {
      globalThis.fetch = failure.fetch;
      const providerSettings = {
        ...settings,
        wechatRequestTimeoutMs: failure.timeoutMs ?? settings.wechatRequestTimeoutMs,
      };
      const service = new AuthService(database, providerSettings);
      await assert.rejects(service.wechatLogin(failure.code), (error: unknown) => {
        assert.ok(error instanceof BusinessError);
        assert.equal(error.code, 'WECHAT_LOGIN_FAILED');
        const serialized = `${error.message} ${JSON.stringify(error)}`;
        for (const sensitiveValue of [
          providerSettings.wechatAppSecret,
          failure.code,
          'secret-openid-http',
          'secret-session-http',
          'secret-openid-errcode',
          'secret-session-errcode',
          'secret-openid-timeout',
          'secret-session-timeout',
        ]) {
          assert.ok(!serialized.includes(sensitiveValue));
        }
        return true;
      });
      assert.equal(await database.wechatBindingTicket.count(), 0);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WeChat invitation rejects provider errors and invalid images without saving invitations', async () => {
  const seeded = await seedInvitation();
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash('head-password', 4);
  await database.user.update({
    where: { id: seeded.headTeacherId },
    data: { passwordHash },
  });
  const login = await new AuthService(database, settings).login(
    seeded.headAccount,
    'head-password',
  );
  const app = applyErrorHandler(new Elysia().use(teachersController));
  const originalFetch = globalThis.fetch;
  const initialInvitationCount = await database.teacherInvitation.count({
    where: {
      classTeacherId: seeded.classTeacherId,
      purpose: prismaTypes.TeacherInvitationPurpose.WECHAT_BINDING,
    },
  });

  try {
    const failures: Array<() => Response> = [
      () =>
        Response.json({
          errcode: 41030,
          errmsg: 'invalid scene secret-openid-provider secret-session-provider',
          openid: 'secret-openid-provider',
          session_key: 'secret-session-provider',
        }),
      () =>
        new Response(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), {
          headers: { 'content-type': 'image/png' },
        }),
    ];

    for (const providerFailure of failures) {
      let requestCount = 0;
      globalThis.fetch = (async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return Response.json({ access_token: 'secret-access-token', expires_in: 7200 });
        }
        return providerFailure();
      }) as typeof fetch;

      const response = await app.handle(
        new Request(
          `http://localhost/classes/${seeded.classId}/teachers/${seeded.classTeacherId}/wechat-invitations`,
          {
            method: 'POST',
            headers: { authorization: `Bearer ${login.accessToken}` },
          },
        ),
      );
      const body = await response.text();
      assert.equal(response.status, 502);
      assert.ok(body.includes('小程序码生成失败，请稍后重试'));
      for (const sensitiveValue of [
        settings.wechatAppSecret,
        'secret-openid-provider',
        'secret-session-provider',
        'secret-access-token',
      ]) {
        assert.ok(!body.includes(sensitiveValue));
      }
      assert.equal(requestCount, 2);
      assert.equal(
        await database.teacherInvitation.count({
          where: {
            classTeacherId: seeded.classTeacherId,
            purpose: prismaTypes.TeacherInvitationPurpose.WECHAT_BINDING,
          },
        }),
        initialInvitationCount,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WeChat invitation accepts PNG and JPEG image responses with matching signatures', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [contentType, signature] of [
      ['image/png', '89504e470d0a1a0a'],
      ['image/jpeg', 'ffd8ffe00000ffd9'],
    ]) {
      let calls = 0;
      globalThis.fetch = (async () => {
        if (++calls === 1) return Response.json({ access_token: 'test-provider-token' });
        return new Response(Buffer.from(signature!, 'hex'), {
          headers: { 'content-type': `${contentType}; charset=binary` },
        });
      }) as typeof fetch;
      const result = await new AuthService(database, settings).generateWechatInvitationCode(
        'test-scene',
      );
      assert.equal(
        result,
        `data:${contentType};base64,${Buffer.from(signature!, 'hex').toString('base64')}`,
      );
      assert.equal(calls, 2);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('disabled WeChat login does not exchange codes', async () => {
  let called = false;
  const disabledService = new AuthService(
    database,
    { ...settings, wechatEnabled: false },
    async () => {
      called = true;
      return { appId, openId: 'must-not-be-requested' };
    },
  );
  await assertBusinessError(disabledService.wechatLogin('one-time-code'), 'WECHAT_LOGIN_DISABLED');
  assert.equal(called, false);
});

test('unbound login, purpose isolation, bind, same-user retry, and bound login', async () => {
  const seeded = await seedInvitation();
  const service = serviceFor(() => 'openid-first');
  const login = await service.wechatLogin('first');
  assert.equal(login.status, 'UNBOUND');
  if (login.status !== 'UNBOUND') throw new Error('Expected an unbound login');
  assert.equal(login.ticket.length, 43);
  assert.ok(!JSON.stringify(login).includes('openid-first'));

  const savedTicket = await database.wechatBindingTicket.findUnique({
    where: { ticketHash: hash(login.ticket) },
  });
  assert.ok(savedTicket);
  assert.notEqual(savedTicket.ticketHash, login.ticket);
  assert.equal(savedTicket.openId, 'openid-first');

  await assertBusinessError(
    service.getWechatInvitationPreview(seeded.webToken),
    'INVITATION_NOT_FOUND',
  );
  await assertBusinessError(
    service.getInvitationPreview(seeded.wechatToken),
    'INVITATION_NOT_FOUND',
  );
  await assertBusinessError(service.consumeInvitation(seeded.wechatToken), 'INVITATION_NOT_FOUND');
  const preview = await service.getWechatInvitationPreview(seeded.wechatToken);
  assert.equal(preview.teacher.id, seeded.teacherId);
  assert.equal(preview.teacher.name.startsWith('任课教师-'), true);
  assert.equal(preview.teacher.subject, '数学');
  assert.ok(!JSON.stringify(preview).includes('openid-first'));

  const bound = await service.bindWechatIdentity(login.ticket, seeded.wechatToken);
  assert.equal(bound.status, 'BOUND');
  assert.equal(bound.teacher.id, seeded.teacherId);
  assert.equal(bound.classroom.id, seeded.classId);
  assert.ok(bound.accessToken.length > 20);
  assert.equal(
    await database.wechatTeacherIdentity.count({ where: { appId, openId: 'openid-first' } }),
    1,
  );
  assert.equal(
    await database.session.count({
      where: { userId: seeded.teacherId, clientType: 'TEACHER_MOBILE' },
    }),
    1,
  );
  await assertBusinessError(
    service.bindWechatIdentity(login.ticket, seeded.wechatToken),
    'WECHAT_TICKET_REPLAYED',
  );

  const recovered = await service.wechatLogin('again');
  assert.equal(recovered.status, 'BOUND');
  if (recovered.status === 'BOUND') assert.equal(recovered.teacher.id, seeded.teacherId);
});

test('expired binding tickets are rejected without consuming the invitation', async () => {
  const seeded = await seedInvitation();
  const service = serviceFor();
  const ticket = randomBytes(32).toString('base64url');
  await database.wechatBindingTicket.create({
    data: {
      ticketHash: hash(ticket),
      appId,
      openId: 'expired-openid',
      expiresAt: new Date(now() - 1000),
    },
  });
  await assertBusinessError(
    service.bindWechatIdentity(ticket, seeded.wechatToken),
    'WECHAT_TICKET_EXPIRED',
  );
  const invitation = await database.teacherInvitation.findUnique({
    where: { tokenHash: hash(seeded.wechatToken) },
  });
  assert.equal(invitation?.status, 'PENDING');
});

test('an identity collision or a second identity for one teacher is never overwritten', async () => {
  const first = await seedInvitation();
  const second = await seedInvitation();
  const service = serviceFor();
  const ticketForExistingIdentity = await service.wechatLogin('conflict-identity');
  assert.equal(ticketForExistingIdentity.status, 'UNBOUND');
  if (ticketForExistingIdentity.status !== 'UNBOUND') throw new Error('Expected an unbound login');

  await database.wechatTeacherIdentity.create({
    data: { appId, openId: 'openid-conflict-identity', userId: second.teacherId },
  });
  await assertBusinessError(
    service.bindWechatIdentity(ticketForExistingIdentity.ticket, first.wechatToken),
    'WECHAT_IDENTITY_CONFLICT',
  );

  const ticketForAccount = await service.wechatLogin('conflict-account');
  assert.equal(ticketForAccount.status, 'UNBOUND');
  if (ticketForAccount.status !== 'UNBOUND') throw new Error('Expected an unbound login');
  await database.wechatTeacherIdentity.create({
    data: { appId, openId: 'another-openid', userId: first.teacherId },
  });
  await assertBusinessError(
    service.bindWechatIdentity(ticketForAccount.ticket, first.wechatToken),
    'TEACHER_WECHAT_CONFLICT',
  );
  assert.equal(
    await database.wechatTeacherIdentity.count({ where: { userId: first.teacherId } }),
    1,
  );
});

test('concurrent binding attempts for one invite create a single identity and session', async () => {
  const seeded = await seedInvitation();
  const service = serviceFor();
  const [left, right] = await Promise.all([
    service.wechatLogin('concurrent-left'),
    service.wechatLogin('concurrent-right'),
  ]);
  assert.equal(left.status, 'UNBOUND');
  assert.equal(right.status, 'UNBOUND');
  if (left.status !== 'UNBOUND' || right.status !== 'UNBOUND') {
    throw new Error('Expected two unbound logins');
  }
  const outcomes = await Promise.allSettled([
    service.bindWechatIdentity(left.ticket, seeded.wechatToken),
    service.bindWechatIdentity(right.ticket, seeded.wechatToken),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(
    await database.wechatTeacherIdentity.count({ where: { userId: seeded.teacherId } }),
    1,
  );
  assert.equal(
    await database.session.count({
      where: { userId: seeded.teacherId, clientType: 'TEACHER_MOBILE' },
    }),
    1,
  );
});

test('concurrent invitation reissues leave only one pending invite of the same purpose', async () => {
  const seeded = await seedInvitation();
  const [firstToken, secondToken] = [
    randomBytes(24).toString('base64url'),
    randomBytes(24).toString('base64url'),
  ];
  const calls = [firstToken, secondToken].map((token) =>
    replacePendingTeacherInvitation(database, {
      classId: seeded.classId,
      classTeacherId: seeded.classTeacherId,
      actorId: seeded.headTeacherId,
      token,
      expiresAt: new Date(Date.now() + 60_000),
      purpose: prismaTypes.TeacherInvitationPurpose.WECHAT_BINDING,
      appId,
    }),
  );
  const outcomes = await Promise.allSettled(calls);
  assert.ok(outcomes.some((outcome) => outcome.status === 'fulfilled'));
  const pendingWechat = await database.teacherInvitation.count({
    where: {
      classTeacherId: seeded.classTeacherId,
      purpose: prismaTypes.TeacherInvitationPurpose.WECHAT_BINDING,
      status: prismaTypes.InvitationStatus.PENDING,
      usedAt: null,
    },
  });
  assert.equal(pendingWechat, 1);
  const pendingWeb = await database.teacherInvitation.count({
    where: {
      classTeacherId: seeded.classTeacherId,
      purpose: prismaTypes.TeacherInvitationPurpose.WEB_ACTIVATION,
      status: prismaTypes.InvitationStatus.PENDING,
      usedAt: null,
    },
  });
  assert.equal(pendingWeb, 1);
});

test('disabled teachers and revoked relations cannot bind', async () => {
  const disabledAccount = await seedInvitation();
  const disabledService = serviceFor();
  const disabledTicket = await disabledService.wechatLogin('disabled-account');
  if (disabledTicket.status !== 'UNBOUND') throw new Error('Expected an unbound login');
  await database.user.update({
    where: { id: disabledAccount.teacherId },
    data: { status: prismaTypes.UserStatus.DISABLED },
  });
  await assertBusinessError(
    disabledService.bindWechatIdentity(disabledTicket.ticket, disabledAccount.wechatToken),
    'INVITATION_REVOKED',
  );

  const revokedRelation = await seedInvitation();
  const revokedService = serviceFor();
  const revokedTicket = await revokedService.wechatLogin('revoked-relation');
  if (revokedTicket.status !== 'UNBOUND') throw new Error('Expected an unbound login');
  await database.classTeacher.update({
    where: { id: revokedRelation.classTeacherId },
    data: { status: prismaTypes.RelationStatus.REVOKED },
  });
  await assertBusinessError(
    revokedService.bindWechatIdentity(revokedTicket.ticket, revokedRelation.wechatToken),
    'INVITATION_REVOKED',
  );
  assert.equal(
    await database.wechatTeacherIdentity.count({ where: { userId: disabledAccount.teacherId } }),
    0,
  );
  assert.equal(
    await database.wechatTeacherIdentity.count({ where: { userId: revokedRelation.teacherId } }),
    0,
  );
});

test('user disable and relation revoke races are rechecked in the bind transaction', async () => {
  const disabled = await seedInvitation();
  const disabledLogin = await serviceFor().wechatLogin('disable-race');
  if (disabledLogin.status !== 'UNBOUND') throw new Error('Expected an unbound login');
  let disabledAfterRead = false;
  const databaseWithDisableRace = database.$extends({
    query: {
      teacherInvitation: {
        async findUnique({ args, query }) {
          const result = await query(args);
          if (!disabledAfterRead && args.where.tokenHash === hash(disabled.wechatToken)) {
            disabledAfterRead = true;
            await database.user.update({
              where: { id: disabled.teacherId },
              data: { status: prismaTypes.UserStatus.DISABLED },
            });
          }
          return result;
        },
      },
    },
  });
  const serviceWithDisableRace = new AuthService(
    databaseWithDisableRace as unknown as PrismaClientType,
    settings,
    async () => ({ appId, openId: 'openid-disable-race' }),
  );
  await assertBusinessError(
    serviceWithDisableRace.bindWechatIdentity(disabledLogin.ticket, disabled.wechatToken),
    'INVITATION_REVOKED',
  );
  assert.equal(disabledAfterRead, true);

  const revoked = await seedInvitation();
  const revokedLogin = await serviceFor().wechatLogin('relation-race');
  if (revokedLogin.status !== 'UNBOUND') throw new Error('Expected an unbound login');
  let revokedAfterRead = false;
  const databaseWithRevokeRace = database.$extends({
    query: {
      teacherInvitation: {
        async findUnique({ args, query }) {
          const result = await query(args);
          if (!revokedAfterRead && args.where.tokenHash === hash(revoked.wechatToken)) {
            revokedAfterRead = true;
            await database.classTeacher.update({
              where: { id: revoked.classTeacherId },
              data: { status: prismaTypes.RelationStatus.REVOKED },
            });
          }
          return result;
        },
      },
    },
  });
  const serviceWithRevokeRace = new AuthService(
    databaseWithRevokeRace as unknown as PrismaClientType,
    settings,
    async () => ({ appId, openId: 'openid-relation-race' }),
  );
  await assertBusinessError(
    serviceWithRevokeRace.bindWechatIdentity(revokedLogin.ticket, revoked.wechatToken),
    'INVITATION_REVOKED',
  );
  assert.equal(revokedAfterRead, true);
});
