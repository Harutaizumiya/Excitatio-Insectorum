import { createHash } from 'node:crypto';
import { Prisma, StudentStatus } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { BusinessException } from '../common';
import { DisplaysService } from './displays.service';

const future = (): string => new Date(Date.now() + 120_000).toISOString();

describe('DisplaysService', () => {
  const config = {
    getOrThrow: jest.fn((key: string) =>
      key === 'jwt.deviceAccessExpiresIn' ? '30m' : 'a-secure-access-secret',
    ),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') };

  function setup() {
    const transaction = {
      displayDevice: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'device-1' }),
        updateMany: jest.fn(),
      },
      deviceCredential: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
      ),
      displayDevice: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      classroom: { findUnique: jest.fn() },
      student: { findMany: jest.fn() },
      scoreRecord: { groupBy: jest.fn() },
    };
    const redis = {
      client: {
        set: jest.fn(),
        getdel: jest.fn(),
        incr: jest.fn(),
        expire: jest.fn(),
      },
      getJson: jest.fn(),
      setJson: jest.fn(),
    };
    const ranking = {
      getWeeklyRanking: jest.fn().mockResolvedValue({ top3: [], progress: [] }),
    };
    const schedules = {
      getForDisplay: jest.fn().mockResolvedValue({ periods: [], entries: [] }),
    };
    const service = new DisplaysService(
      prisma as never,
      redis as never,
      jwt as never,
      config as never,
      ranking as never,
      undefined,
      schedules as never,
    );
    return { service, prisma, redis, transaction, ranking, schedules };
  }

  beforeEach(() => jest.clearAllMocks());

  it('includes the active schedule snapshot in display bootstrap', async () => {
    const { service, prisma, schedules } = setup();
    prisma.displayDevice.findFirst.mockResolvedValue({ id: 'display-1' });
    prisma.classroom.findUnique.mockResolvedValue({
      id: 'class-1',
      name: '一年级一班',
      gridRows: 7,
      gridCols: 11,
      currentLayout: null,
    });
    schedules.getForDisplay.mockResolvedValue({
      periods: [{ periodNo: 1, startTime: '08:00', endTime: '08:40' }],
      entries: [{ weekday: 3, periodNo: 1, courseName: '数学' }],
    });

    const result = await service.getBootstrap('display-1', 'class-1');
    expect(result.schedule).toEqual({
      periods: [{ periodNo: 1, startTime: '08:00', endTime: '08:40' }],
      entries: [{ weekday: 3, periodNo: 1, courseName: '数学' }],
    });
  });

  it('creates a six-digit code and both Redis records with a ten-minute TTL', async () => {
    const { service, redis } = setup();
    redis.client.incr.mockResolvedValue(1);
    redis.client.expire.mockResolvedValue(1);
    redis.client.set.mockResolvedValue('OK');

    const result = await service.createBindingCode('127.0.0.1');
    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.nonce.length).toBeGreaterThanOrEqual(32);
    expect(redis.client.set).toHaveBeenCalledWith(
      `display:binding:${result.code}`,
      expect.any(String),
      'EX',
      600,
      'NX',
    );
    expect(redis.setJson).toHaveBeenCalledWith(
      `display:binding:session:${result.bindingSessionId}`,
      expect.objectContaining({ status: 'PENDING' }),
      600,
    );
  });

  it('allows teacher to create a 10-minute classroom binding code and screen to bind by code', async () => {
    const { service, redis, prisma, transaction } = setup();
    redis.client.incr.mockResolvedValue(1);
    redis.client.expire.mockResolvedValue(1);
    redis.client.set.mockResolvedValue('OK');
    prisma.displayDevice.count = jest.fn().mockResolvedValue(0);
    prisma.classroom.findUnique = jest.fn().mockResolvedValue({ id: 'class-1', name: '一年级一班' });

    const created = await service.createClassroomBindingCode('class-1', { name: '前黑板大屏' });
    expect(created.code).toMatch(/^\d{6}$/);
    expect(redis.client.set).toHaveBeenCalledWith(
      `display:class-code:${created.code}`,
      expect.any(String),
      'EX',
      600,
      'NX',
    );

    const sessionData = JSON.stringify({
      sessionId: created.sessionId,
      code: created.code,
      classId: 'class-1',
      deviceName: '前黑板大屏',
      status: 'PENDING',
      expiresAt: created.expiresAt,
    });
    redis.client.getdel.mockResolvedValueOnce(sessionData);

    const bound = await service.bindDisplayByCode({ code: created.code });
    expect(bound.deviceId).toBeDefined();
    expect(bound.credential).toBeDefined();
    expect(bound.classroom.name).toBe('一年级一班');
    expect(transaction.displayDevice.create).toHaveBeenCalled();
  });

  it('consumes a binding code once and rejects a third ACTIVE device transactionally', async () => {
    const { service, redis, transaction } = setup();
    const binding = JSON.stringify({
      status: 'PENDING',
      bindingSessionId: 'session-1',
      nonceHash: 'hash',
      expiresAt: future(),
    });
    redis.client.getdel.mockResolvedValueOnce(binding).mockResolvedValueOnce(null);
    transaction.displayDevice.count.mockResolvedValue(2);

    await expect(
      service.bindDevice('class-1', { code: '123456', name: '第三块屏' }),
    ).rejects.toMatchObject({ code: 'DISPLAY_DEVICE_LIMIT_REACHED' });
    expect(transaction.displayDevice.create).not.toHaveBeenCalled();

    await expect(
      service.bindDevice('class-1', { code: '123456', name: '重复提交' }),
    ).rejects.toMatchObject({ code: 'BINDING_CODE_INVALID' });
  });

  it('rejects an expired binding code', async () => {
    const { service, redis } = setup();
    redis.client.getdel.mockResolvedValue(
      JSON.stringify({
        status: 'PENDING',
        bindingSessionId: 'session-1',
        nonceHash: 'hash',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    );
    await expect(
      service.bindDevice('class-1', { code: '123456', name: '过期屏' }),
    ).rejects.toMatchObject({ code: 'BINDING_CODE_EXPIRED' });
  });

  it('retries a concurrent Serializable conflict before observing the two-device limit', async () => {
    const { service, prisma, redis, transaction } = setup();
    redis.client.getdel.mockResolvedValue(
      JSON.stringify({
        status: 'PENDING',
        bindingSessionId: 'session-1',
        nonceHash: 'hash',
        expiresAt: future(),
      }),
    );
    transaction.displayDevice.count.mockResolvedValue(2);
    const conflict = new Prisma.PrismaClientKnownRequestError('serialization conflict', {
      code: 'P2034',
      clientVersion: '6.19.0',
    });
    prisma.$transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
      );

    await expect(
      service.bindDevice('class-1', { code: '123456', name: '并发第三屏' }),
    ).rejects.toMatchObject({ code: 'DISPLAY_DEVICE_LIMIT_REACHED' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    const transactionCalls = prisma.$transaction.mock.calls as unknown as Array<
      [unknown, { isolationLevel: Prisma.TransactionIsolationLevel }]
    >;
    expect(transactionCalls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('persists only a credential hash and lets the nonce holder claim the raw secret once', async () => {
    const { service, redis, transaction } = setup();
    const nonce = 'n'.repeat(40);
    const binding = {
      status: 'PENDING' as const,
      bindingSessionId: 'session-1',
      nonceHash: createHash('sha256').update(nonce).digest('hex'),
      expiresAt: future(),
    };
    redis.client.getdel.mockResolvedValueOnce(JSON.stringify(binding));

    await service.bindDevice('class-1', { code: '123456', name: '主屏' });
    const databaseWrite = transaction.displayDevice.create.mock.calls[0][0] as {
      data: { credentials: { create: { secretHash: string } } };
    };
    const ready = redis.setJson.mock.calls[0][1] as {
      status: string;
      deviceId: string;
      credentialCiphertext: string;
      credentialIv: string;
      credentialTag: string;
      nonceHash: string;
      bindingSessionId: string;
      expiresAt: string;
    };
    expect(ready).not.toHaveProperty('credential');
    expect(databaseWrite.data.credentials.create.secretHash).not.toBe(ready.credentialCiphertext);

    redis.getJson.mockResolvedValueOnce(ready);
    await expect(service.pollBindingSession('session-1', 'x'.repeat(40))).rejects.toMatchObject({
      code: 'BINDING_SESSION_FORBIDDEN',
    });
    redis.getJson.mockResolvedValueOnce(ready);
    redis.client.getdel.mockResolvedValueOnce(JSON.stringify(ready));
    const claimed = await service.pollBindingSession('session-1', nonce);
    expect(claimed).toEqual({
      status: 'READY',
      deviceId: ready.deviceId,
      credential: expect.any(String),
    });
    const claimedCredential = (claimed as { credential: string }).credential;
    await expect(
      compare(claimedCredential, databaseWrite.data.credentials.create.secretHash),
    ).resolves.toBe(true);

    redis.getJson.mockResolvedValueOnce(null);
    await expect(service.pollBindingSession('session-1', nonce)).rejects.toMatchObject({
      code: 'BINDING_SESSION_NOT_FOUND',
    });
  });

  it('revokes a newly created device when secure credential delivery cannot be prepared', async () => {
    const { service, redis, transaction } = setup();
    redis.client.getdel.mockResolvedValue(
      JSON.stringify({
        status: 'PENDING',
        bindingSessionId: 'session-1',
        nonceHash: 'hash',
        expiresAt: future(),
      }),
    );
    redis.setJson.mockRejectedValue(new Error('redis unavailable'));

    await expect(service.bindDevice('class-1', { code: '123456', name: '主屏' })).rejects.toThrow(
      'redis unavailable',
    );
    expect(transaction.displayDevice.updateMany).toHaveBeenCalledWith({
      where: { id: expect.any(String), status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: expect.any(Date) },
    });
    expect(transaction.deviceCredential.updateMany).toHaveBeenCalledWith({
      where: { deviceId: expect.any(String), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('uses one stable auth error for unknown, revoked, and wrong credentials', async () => {
    const { service, prisma } = setup();
    prisma.displayDevice.findFirst.mockResolvedValueOnce(null);
    await expect(service.exchangeCredential('revoked', 'x'.repeat(32))).rejects.toMatchObject({
      code: 'INVALID_DEVICE_CREDENTIAL',
    });

    prisma.displayDevice.findFirst.mockResolvedValueOnce({
      id: 'device-1',
      classId: 'class-1',
      credentials: [{ secretHash: await hash('correct-credential', 4) }],
    });
    await expect(service.exchangeCredential('device-1', 'wrong'.repeat(8))).rejects.toMatchObject({
      code: 'INVALID_DEVICE_CREDENTIAL',
    });
  });

  it('bootstrap rejects revoked devices and never exposes ranking scores', async () => {
    const { service, prisma, ranking } = setup();
    prisma.displayDevice.findFirst.mockResolvedValueOnce({ id: 'device-1' });
    prisma.classroom.findUnique.mockResolvedValueOnce({
      id: 'class-1',
      name: '一班',
      gridRows: 6,
      gridCols: 8,
      currentLayout: {
        version: 3,
        seats: [
          {
            rowIndex: 0,
            colIndex: 1,
            student: { id: 'student-1', name: '甲', status: StudentStatus.ACTIVE },
          },
        ],
      },
    });
    ranking.getWeeklyRanking.mockResolvedValueOnce({
      top3: [{ studentId: 'student-1', name: '甲', rank: 1 }],
      progress: [
        {
          studentId: 'student-2',
          name: '乙',
          previousRank: 4,
          currentRank: 2,
          change: 2,
        },
      ],
    });

    const result = await service.getBootstrap('device-1', 'class-1');
    expect(JSON.stringify(result)).not.toMatch(/score|delta/i);
    expect(result.ranking.top3[0]).toEqual({ studentId: 'student-1', name: '甲', rank: 1 });

    prisma.displayDevice.findFirst.mockResolvedValueOnce(null);
    prisma.classroom.findUnique.mockResolvedValueOnce(null);
    ranking.getWeeklyRanking.mockResolvedValueOnce({ top3: [], progress: [] });
    await expect(service.getBootstrap('device-1', 'class-1')).rejects.toMatchObject({
      code: 'DISPLAY_DEVICE_REVOKED',
    });
  });

  it('throws BusinessException instances for business failures', async () => {
    const { service, prisma } = setup();
    prisma.displayDevice.findFirst.mockResolvedValue(null);
    await service.exchangeCredential('missing', 'x'.repeat(32)).catch((error: unknown) => {
      expect(error).toBeInstanceOf(BusinessException);
    });
  });
});
