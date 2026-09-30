import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import type { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { io, type Socket } from 'socket.io-client';

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const connected = () => {
      socket.off('connect_error', failed);
      resolve();
    };
    const failed = (error: Error) => {
      socket.off('connect', connected);
      reject(error);
    };
    socket.once('connect', connected);
    socket.once('connect_error', failed);
  });
}

test('announcement pause, timeout, and reconnect regressions', { timeout: 30_000 }, async (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'excitatio-announcement-regression-'));
  const databasePath = resolve(directory, 'review.db');
  const packageRoot = resolve(process.cwd(), '../../packages/database');
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const databaseUrl = `file:${databasePath.replace(/\\/g, '/')}`;
  execFileSync(
    process.execPath,
    [
      resolve(packageRoot, 'scripts/run-sqlite-prisma.mjs'),
      'migrate',
      'deploy',
      '--schema',
      'prisma/sqlite/schema.prisma',
    ],
    { cwd: packageRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' },
  );
  process.env.DATABASE_URL = databaseUrl;
  const { prisma } = await import('../../plugins/prisma');
  const { announcementsService: service } = await import('./announcements.service');
  const { realtimeService } = await import('../realtime/realtime.service');
  const originalOnline = realtimeService.getConnectedDisplayDeviceIds;
  try {
    const classroom = await prisma.classroom.create({ data: { name: '回归测试' } });
    const teacher = await prisma.user.create({
      data: { name: '老师', account: 'review', passwordHash: 'test' },
    });
    await prisma.classTeacher.create({
      data: { classId: classroom.id, teacherId: teacher.id, role: 'HEAD_TEACHER' },
    });
    const device = await prisma.displayDevice.create({
      data: { classId: classroom.id, name: '大屏', soundReady: true },
    });
    realtimeService.getConnectedDisplayDeviceIds = () => [device.id];
    const input = { mode: 'CUSTOM' as const, text: '测试', repeatCount: 1, durationSeconds: 10 };

    await t.test(
      'a stale timeout candidate rechecks a committed pause and preserves its saved remainder',
      async () => {
        const announcement = await service.create(teacher.id, classroom.id, {
          ...input,
          idempotencyKey: 'pause',
        });
        await service.displayed(device.id, classroom.id, announcement.id);
        const originalNow = Date.now;
        const originalTransaction = prisma.$transaction.bind(prisma);
        const originalFind = prisma.announcementDelivery.findMany.bind(prisma.announcementDelivery);
        const baseTime = originalNow();
        await prisma.announcementDelivery.updateMany({
          where: { announcementId: announcement.id },
          data: { expiresAt: new Date(baseTime + 1000) },
        });
        let updateStarted!: () => void;
        const started = new Promise<void>((resolve) => {
          updateStarted = resolve;
        });
        let allowUpdate!: () => void;
        const released = new Promise<void>((resolve) => {
          allowUpdate = resolve;
        });
        prisma.$transaction = ((callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          originalTransaction(async (tx) => {
            const delivery = new Proxy(tx.announcementDelivery, {
              get(target, key) {
                if (key === 'updateMany')
                  return async (args: Prisma.AnnouncementDeliveryUpdateManyArgs) => {
                    if (typeof args.data.pausedRemainingMs === 'number') {
                      updateStarted();
                      await released;
                    }
                    return target.updateMany(args);
                  };
                return Reflect.get(target, key);
              },
            });
            return callback(
              new Proxy(tx, {
                get(target, key) {
                  return key === 'announcementDelivery' ? delivery : Reflect.get(target, key);
                },
              }),
            );
          })) as typeof prisma.$transaction;
        let starting: ReturnType<typeof service.input> | undefined;
        try {
          Date.now = () => baseTime;
          starting = service.input(device.id, classroom.id, announcement.id, 'START');
          await started;
          prisma.announcementDelivery.findMany = (async (
            args: Prisma.AnnouncementDeliveryFindManyArgs,
          ) => {
            const oldSnapshot = await originalFind(args);
            allowUpdate();
            const accepted = await starting!;
            assert.equal(accepted.status, 'DISPLAYING');
            assert.equal(accepted.deliveries[0].inputActive, true);
            return oldSnapshot;
          }) as typeof prisma.announcementDelivery.findMany;
          Date.now = () => baseTime + 1500;
          await service.tick();
          const active = await service.get(teacher.id, classroom.id, announcement.id);
          assert.equal(active.status, 'DISPLAYING');
          assert.equal(active.deliveries[0].inputActive, true);
          assert.equal(
            await prisma.announcementLock.count({ where: { classId: classroom.id } }),
            1,
          );
          prisma.announcementDelivery.findMany = originalFind;
          prisma.$transaction = originalTransaction;
          const resumed = await service.input(device.id, classroom.id, announcement.id, 'RETURN');
          assert.equal(resumed.deliveries[0].expiresAt?.getTime(), baseTime + 2500);
          await service.tick();
          assert.equal(
            (await service.get(teacher.id, classroom.id, announcement.id)).status,
            'DISPLAYING',
          );
          Date.now = () => baseTime + 2501;
          await service.tick();
          assert.equal(
            (await service.get(teacher.id, classroom.id, announcement.id)).status,
            'TIMED_OUT',
          );
        } finally {
          allowUpdate();
          await starting?.catch(() => undefined);
          Date.now = originalNow;
          prisma.$transaction = originalTransaction;
          prisma.announcementDelivery.findMany = originalFind;
        }
      },
    );

    await t.test('START cannot pause a message after timeout wins', async () => {
      const announcement = await service.create(teacher.id, classroom.id, {
        ...input,
        idempotencyKey: 'timeout',
      });
      await service.displayed(device.id, classroom.id, announcement.id);
      await prisma.announcementDelivery.updateMany({
        where: { announcementId: announcement.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await service.tick();
      await assert.rejects(
        service.input(device.id, classroom.id, announcement.id, 'START'),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ANNOUNCEMENT_ENDED',
      );
      assert.equal(await prisma.announcementLock.count({ where: { classId: classroom.id } }), 0);
    });

    await t.test(
      'a delayed disconnect reset cannot overwrite a newer readiness registration',
      async () => {
        const originalUpdate = prisma.displayDevice.update.bind(prisma.displayDevice);
        let releaseReset!: () => void;
        const resetPending = new Promise<void>((resolve) => {
          releaseReset = resolve;
        });
        let resetStarted!: () => void;
        const started = new Promise<void>((resolve) => {
          resetStarted = resolve;
        });
        prisma.displayDevice.update = (async (args: Prisma.DisplayDeviceUpdateArgs) => {
          if (args.data.soundReady === false) {
            resetStarted();
            await resetPending;
          }
          return originalUpdate(args);
        }) as unknown as typeof prisma.displayDevice.update;
        try {
          const reset = realtimeService.setDisplaySoundReady(device.id, false);
          await started;
          const registered = service.setSoundReady(device.id, true);
          releaseReset();
          await Promise.all([reset, registered]);
          assert.equal(
            (await prisma.displayDevice.findUniqueOrThrow({ where: { id: device.id } })).soundReady,
            true,
          );
        } finally {
          releaseReset();
          prisma.displayDevice.update = originalUpdate;
        }
      },
    );

    await t.test(
      'a real display disconnect, reconnect, and HTTP readiness registration allows another announcement',
      async () => {
        realtimeService.getConnectedDisplayDeviceIds = originalOnline;
        const { config } = await import('../../config');
        const { app } = await import('../../app');
        const server = http.createServer();
        realtimeService.attach(server);
        const socketServer = (
          realtimeService as unknown as { io: { close: (callback: () => void) => void } }
        ).io;
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const token = jwt.sign(
          { sub: device.id, classId: classroom.id, type: 'DISPLAY_DEVICE' },
          config.jwtAccessSecret,
          { expiresIn: '5m' },
        );
        const socket = io(`http://127.0.0.1:${address.port}/realtime`, {
          auth: { token },
          transports: ['websocket'],
          reconnection: false,
        });
        try {
          await waitForConnect(socket);
          await service.setSoundReady(device.id, true);
          socket.disconnect();
          const deadline = Date.now() + 3000;
          while (
            (await prisma.displayDevice.findUniqueOrThrow({ where: { id: device.id } })).soundReady
          ) {
            assert.ok(Date.now() < deadline, 'Disconnect must reset readiness');
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          const connected = waitForConnect(socket);
          socket.connect();
          await connected;
          const response = await app.handle(
            new Request('http://localhost/api/v1/display/announcements/sound', {
              method: 'POST',
              headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
              body: JSON.stringify({ ready: true }),
            }),
          );
          assert.equal(response.status, 200);
          const next = await service.create(teacher.id, classroom.id, {
            ...input,
            idempotencyKey: 'reconnected',
          });
          assert.equal(next.status, 'WAITING_DISPLAY');
          await service.end(teacher.id, classroom.id, next.id);
        } finally {
          socket.disconnect();
          await new Promise<void>((resolve) => socketServer.close(resolve));
          await realtimeService.setDisplaySoundReady(device.id, false);
        }
      },
    );
  } finally {
    realtimeService.getConnectedDisplayDeviceIds = originalOnline;
    await prisma.$disconnect();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    unlinkSync(databasePath);
    rmdirSync(directory);
  }
});
