import assert from 'node:assert/strict';
import test from 'node:test';
import { ScoreEventType } from '@prisma/client';
import { BusinessError } from '../../plugins/error-handler';
import { ScoreEventsService } from '../scores/score-events.service';

interface HarnessOptions {
  existing?: ReturnType<typeof scoreEvent>;
  studentIds?: string[];
}

function scoreEvent() {
  return {
    id: 'event-1',
    classId: 'class-1',
    periodId: 'period-1',
    type: ScoreEventType.DORM_HYGIENE,
    operatorId: 'teacher-1',
    occurredAt: new Date('2026-09-22T02:00:00.000Z'),
    reason: '寝室卫生',
    parameters: '{}',
    businessKey: 'dorm-score-1',
    sourceDormitoryId: 'dorm-1',
    sourceDormitoryName: '301',
    createdAt: new Date('2026-09-22T02:00:00.000Z'),
    participants: [{ studentId: 'student-1' }, { studentId: 'student-2' }],
    scoreRecords: [
      { studentId: 'student-1', delta: 2 },
      { studentId: 'student-2', delta: 2 },
    ],
  };
}

function createHarness(options: HarnessOptions = {}) {
  const writes = {
    eventCreates: [] as Array<Record<string, unknown>>,
    participantCreates: [] as Array<Record<string, unknown>>,
    recordCreates: [] as Array<Record<string, unknown>>,
    realtime: [] as Array<Record<string, unknown>>,
    dormitoryReads: 0,
  };
  let persisted: Record<string, unknown> | undefined = options.existing;
  const tx = {
    classTeacher: {
      findFirst: async () => ({ teacherId: 'teacher-1', subject: '生活教育' }),
    },
    scoreEvent: {
      findUnique: async () => options.existing ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.eventCreates.push(data);
        persisted = {
          ...scoreEvent(),
          reason: data.reason as string,
          businessKey: data.businessKey as string,
          sourceDormitoryId: data.sourceDormitoryId as string | null,
          sourceDormitoryName: data.sourceDormitoryName as string | null,
          participants: [],
          scoreRecords: [],
        };
        return persisted;
      },
      findUniqueOrThrow: async () => ({
        ...persisted!,
        participants: [{ studentId: 'student-1' }, { studentId: 'student-2' }],
        scoreRecords: [
          { studentId: 'student-1', delta: 2 },
          { studentId: 'student-2', delta: 2 },
        ],
      }),
    },
    dormitory: {
      findFirst: async () => {
        writes.dormitoryReads += 1;
        return { name: '301' };
      },
    },
    student: {
      findMany: async () =>
        (options.studentIds ?? ['student-1', 'student-2']).map((id) => ({ id })),
    },
    scoreEventParticipant: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        writes.participantCreates.push(...data);
        return { count: data.length };
      },
    },
    scoreRecord: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        writes.recordCreates.push(...data);
        return { count: data.length };
      },
    },
  };
  const db = {
    classTeacher: { findFirst: async () => ({ teacherId: 'teacher-1' }) },
    scoreEvent: { findUnique: async () => options.existing ?? null },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  const periods = {
    ensurePeriodForDate: async () => ({ id: 'period-1' }),
  };
  const realtime = {
    publishClassEvent: (_classId: string, event: Record<string, unknown>) => {
      writes.realtime.push(event);
    },
  };
  return {
    service: new ScoreEventsService(db as never, periods as never, realtime as never),
    writes,
  };
}

const dormitoryInput = {
  type: ScoreEventType.DORM_HYGIENE,
  studentIds: ['student-1', 'student-2'],
  manualDelta: 2,
  reason: '寝室卫生',
  businessKey: 'dorm-score-1',
  dormitoryId: 'dorm-1',
};

test('selected dormitory members create one event and exactly one score record each', async () => {
  const { service, writes } = createHarness();

  const result = await service.create('class-1', 'teacher-1', dormitoryInput);

  assert.equal(writes.eventCreates.length, 1);
  assert.equal(writes.participantCreates.length, 2);
  assert.deepEqual(
    writes.recordCreates.map(({ studentId, delta }) => ({ studentId, delta })),
    [
      { studentId: 'student-1', delta: 2 },
      { studentId: 'student-2', delta: 2 },
    ],
  );
  assert.deepEqual(result.sourceDormitory, { id: 'dorm-1', name: '301' });
  assert.equal(writes.realtime.length, 3);
});

test('dormitory scoring rejects stale or cross-dormitory selections before writing', async () => {
  const { service, writes } = createHarness({ studentIds: ['student-1'] });

  await assert.rejects(
    service.create('class-1', 'teacher-1', dormitoryInput),
    (error: unknown) =>
      error instanceof BusinessError && error.code === 'DORMITORY_MEMBER_MISMATCH',
  );
  assert.equal(writes.eventCreates.length, 0);
  assert.equal(writes.recordCreates.length, 0);
  assert.equal(writes.realtime.length, 0);
});

test('an identical business key returns the original dormitory event without duplicate writes', async () => {
  const { service, writes } = createHarness({ existing: scoreEvent() });

  const result = await service.create('class-1', 'teacher-1', dormitoryInput);

  assert.equal(result.id, 'event-1');
  assert.equal(writes.eventCreates.length, 0);
  assert.equal(writes.recordCreates.length, 0);
  assert.equal(writes.realtime.length, 0);
});

test('the existing generic DORM_HYGIENE path remains valid without a dormitory id', async () => {
  const { service, writes } = createHarness();

  await service.create('class-1', 'teacher-1', {
    type: ScoreEventType.DORM_HYGIENE,
    studentIds: ['student-1', 'student-2'],
    manualDelta: -1,
    reason: '原通用入口',
    businessKey: 'generic-dorm-score-1',
  });

  assert.equal(writes.dormitoryReads, 0);
  assert.equal(writes.eventCreates[0]?.sourceDormitoryId, null);
});
