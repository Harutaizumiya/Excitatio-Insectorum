import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import {
  createWeeklySeatingRotationTask,
  WeeklySeatingRotationService,
  type WeeklyRotationRunResult,
} from './weekly-seating-rotation.service';

const mondayAfterSchedule = new Date('2026-09-20T16:05:00.000Z');

interface FakeDbOptions {
  marker?: boolean;
  currentLayoutVersionId?: string | null;
  currentCreatedAt?: Date;
  switchedCount?: number;
  autoSeatRotationEnabled?: boolean;
  transactionAutoSeatRotationEnabled?: boolean;
}

function createFakeDb(options: FakeDbOptions = {}) {
  const createdLayouts: Array<Record<string, unknown>> = [];
  const createdSeats: Array<Record<string, unknown>> = [];
  const published: unknown[] = [];
  const currentLayoutVersionId =
    options.currentLayoutVersionId === undefined ? 'layout-1' : options.currentLayoutVersionId;
  const tx = {
    seatLayoutVersion: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if ('rotationWeekKey' in where) {
          return options.marker ? { id: 'layout-rotation', version: 2 } : null;
        }
        return { version: 1 };
      },
      findUnique: async () =>
        currentLayoutVersionId
          ? {
              id: currentLayoutVersionId,
              createdAt: options.currentCreatedAt ?? new Date('2026-09-20T15:00:00.000Z'),
              seats: [
                { rowIndex: 0, colIndex: 0, studentId: 'student-a', cellType: 'SEAT' },
                { rowIndex: 0, colIndex: 1, studentId: null, cellType: 'AISLE' },
                { rowIndex: 0, colIndex: 2, studentId: 'student-b', cellType: 'SEAT' },
              ],
            }
          : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdLayouts.push(data);
        return { id: 'layout-2', version: data.version };
      },
    },
    classroom: {
      findUnique: async () => ({
        currentLayoutVersionId,
        autoSeatRotationEnabled: options.transactionAutoSeatRotationEnabled ?? true,
      }),
      updateMany: async () => ({ count: options.switchedCount ?? 1 }),
    },
    classTeacher: {
      findFirst: async () => ({ teacherId: 'head-teacher-1' }),
    },
    student: {
      findMany: async () => [
        { id: 'student-a', status: 'ACTIVE', deletedAt: null },
        { id: 'student-b', status: 'ACTIVE', deletedAt: null },
      ],
    },
    seat: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        createdSeats.push(...data);
        return { count: data.length };
      },
    },
  };
  const db = {
    classroom: {
      findMany: async () => (options.autoSeatRotationEnabled === false ? [] : [{ id: 'class-1' }]),
    },
    seatLayoutVersion: {
      findFirst: async () => (options.marker ? { id: 'layout-rotation' } : null),
    },
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
  };
  const events = {
    publishClassEvent: (_classId: string, event: unknown) => published.push(event),
  };

  return {
    service: new WeeklySeatingRotationService(db as unknown as PrismaClient, events as never),
    createdLayouts,
    createdSeats,
    published,
  };
}

test('creates one complete rotated snapshot and publishes after the transaction', async () => {
  const fake = createFakeDb();
  const result = await fake.service.run(mondayAfterSchedule);

  assert.deepEqual(result.classes, [
    {
      classId: 'class-1',
      status: 'ROTATED',
      version: 2,
      sourceVersionId: 'layout-1',
      rotatedRows: [0],
    },
  ] as unknown as WeeklyRotationRunResult['classes']);
  assert.equal(fake.createdLayouts[0]?.rotationWeekKey, '2026-09-21');
  assert.equal(fake.createdLayouts[0]?.sourceVersionId, 'layout-1');
  assert.deepEqual(
    fake.createdSeats.map((seat) => seat.studentId),
    ['student-b', null, 'student-a'],
  );
  assert.equal(fake.published.length, 1);
  assert.equal(
    (fake.published[0] as { payload: { source: string } }).payload.source,
    'WEEKLY_ROTATION',
  );
});

test('does not repeat a class already marked with the Taipei week key', async () => {
  const fake = createFakeDb({ marker: true });
  const result = await fake.service.run(new Date('2026-09-23T02:00:00.000Z'));

  assert.deepEqual(result.classes, [
    { classId: 'class-1', status: 'SKIPPED', reason: 'ALREADY_ROTATED' },
  ]);
  assert.equal(fake.createdLayouts.length, 0);
  assert.equal(fake.published.length, 0);
});

test('does not include a class with automatic seat rotation disabled', async () => {
  const fake = createFakeDb({ autoSeatRotationEnabled: false });
  const result = await fake.service.run(mondayAfterSchedule);

  assert.deepEqual(result.classes, []);
  assert.equal(fake.createdLayouts.length, 0);
  assert.equal(fake.published.length, 0);
});

test('skips when automatic seat rotation is disabled after the scheduler query', async () => {
  const fake = createFakeDb({ transactionAutoSeatRotationEnabled: false });
  const result = await fake.service.run(mondayAfterSchedule);

  assert.deepEqual(result.classes, [
    { classId: 'class-1', status: 'SKIPPED', reason: 'AUTO_ROTATION_DISABLED' },
  ]);
  assert.equal(fake.createdLayouts.length, 0);
  assert.equal(fake.published.length, 0);
});

test('does not catch up a layout created after the Monday 00:05 boundary', async () => {
  const fake = createFakeDb({ currentCreatedAt: new Date('2026-09-20T16:06:00.000Z') });
  const result = await fake.service.run(new Date('2026-09-23T02:00:00.000Z'));

  assert.deepEqual(result.classes, [
    { classId: 'class-1', status: 'SKIPPED', reason: 'LAYOUT_CREATED_AFTER_SCHEDULE' },
  ]);
  assert.equal(fake.createdLayouts.length, 0);
});

test('skips a class without a current layout', async () => {
  const fake = createFakeDb({ currentLayoutVersionId: null });
  const result = await fake.service.run(mondayAfterSchedule);

  assert.deepEqual(result.classes, [
    { classId: 'class-1', status: 'SKIPPED', reason: 'NO_LAYOUT' },
  ]);
  assert.equal(fake.createdLayouts.length, 0);
});

test('does not publish or switch when the classroom changed during rotation', async () => {
  const fake = createFakeDb({ switchedCount: 0 });
  const result = await fake.service.run(mondayAfterSchedule);

  assert.deepEqual(result.classes, [
    { classId: 'class-1', status: 'SKIPPED', reason: 'CONCURRENT_LAYOUT_CHANGE' },
  ]);
  assert.equal(fake.published.length, 0);
});

test('exports a cron-configured task for the integrator', async () => {
  const fake = createFakeDb();
  const task = createWeeklySeatingRotationTask('5 0 * * 1', fake.service);

  assert.equal(task.cronExpression, '5 0 * * 1');
  assert.equal(task.timezone, 'Asia/Taipei');
  const beforeSchedule = await task.run(new Date('2026-09-20T16:04:59.000Z'));
  assert.equal(beforeSchedule.due, false);
  assert.throws(() => createWeeklySeatingRotationTask('   ', fake.service), /must not be empty/);
});
