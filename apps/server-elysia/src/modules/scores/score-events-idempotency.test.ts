import assert from 'node:assert/strict';
import test from 'node:test';
import { ScoreEventType } from '@prisma/client';
import { ScoreEventsService, type CreateScoreEventInput } from './score-events.service';

const input: CreateScoreEventInput = {
  type: ScoreEventType.LATE,
  studentIds: ['student-1', 'student-2'],
  minutesLate: 3,
  reason: '迟到登记',
  businessKey: 'request-1',
};
function event() {
  return {
    id: 'event-1',
    classId: 'class-1',
    operatorId: 'teacher-1',
    periodId: 'period-1',
    type: input.type,
    occurredAt: new Date('2026-10-08T00:00:00Z'),
    reason: input.reason,
    parameters: JSON.stringify({
      minutesLate: 3,
      isOrganizer: false,
      specialContribution: false,
      subject: '数学',
    }),
    businessKey: input.businessKey,
    sourceDormitoryId: null,
    sourceDormitoryName: null,
    participants: input.studentIds.map((studentId) => ({ studentId })),
    scoreRecords: input.studentIds.map((studentId) => ({ studentId, delta: -3 })),
  };
}
function harness(
  options: { race?: boolean; access?: boolean; row?: ReturnType<typeof event> } = {},
) {
  const row = options.row ?? event();
  let broadcasts = 0;
  let creates = 0;
  const tx = {
    classTeacher: { findFirst: async () => ({ teacherId: 'teacher-1', subject: '数学' }) },
    scoreEvent: {
      findUnique: async () => (options.race ? null : row),
      create: async () => {
        creates++;
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      },
    },
    student: { findMany: async () => input.studentIds.map((id) => ({ id })) },
  };
  const db = {
    classTeacher: {
      findFirst: async () => (options.access === false ? null : { teacherId: 'teacher-1' }),
    },
    scoreEvent: { findUnique: async () => row },
    $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
  };
  const service = new ScoreEventsService(
    db as never,
    { ensurePeriodForDate: async () => ({ id: 'period-1' }) } as never,
    {
      publishClassEvent: () => {
        broadcasts++;
      },
    } as never,
  );
  return { service, counters: () => ({ creates, broadcasts }) };
}
const conflict = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'SCORE_EVENT_BUSINESS_KEY_CONFLICT';

test('identical request and reordered participant IDs recover the original result without broadcasting', async () => {
  const { service, counters } = harness();
  const result = await service.create('class-1', 'teacher-1', {
    ...input,
    studentIds: [...input.studentIds].reverse(),
  });
  assert.equal(result.id, 'event-1');
  assert.deepEqual(counters(), { creates: 0, broadcasts: 0 });
});

test('a key cannot recover another operator, class, student selection, or changed business input', async () => {
  for (const [classId, operatorId, change] of [
    ['class-2', 'teacher-1', {}],
    ['class-1', 'teacher-2', {}],
    ['class-1', 'teacher-1', { minutesLate: 4 }],
    ['class-1', 'teacher-1', { reason: '不同原因' }],
    ['class-1', 'teacher-1', { studentIds: ['student-1'] }],
    ['class-1', 'teacher-1', { subject: '语文' }],
    ['class-1', 'teacher-1', { occurredAt: '2026-10-09T00:00:00Z' }],
  ] as Array<[string, string, Partial<CreateScoreEventInput>]>) {
    const { service } = harness();
    await assert.rejects(service.create(classId, operatorId, { ...input, ...change }), conflict);
  }
});

test('a unique constraint race recovers only the matching committed request', async () => {
  const { service, counters } = harness({ race: true });
  assert.equal((await service.create('class-1', 'teacher-1', input)).id, 'event-1');
  assert.deepEqual(counters(), { creates: 1, broadcasts: 0 });
  await assert.rejects(service.create('class-1', 'teacher-2', input), conflict);
});

test('result lookup requires current class access and the original operator', async () => {
  assert.equal(
    (await harness().service.getByBusinessKey('class-1', 'teacher-1', 'request-1')).id,
    'event-1',
  );
  await assert.rejects(
    harness({ access: false }).service.getByBusinessKey('class-1', 'teacher-1', 'request-1'),
    { code: 'FORBIDDEN_CLASS_ACCESS' },
  );
  await assert.rejects(harness().service.getByBusinessKey('class-1', 'teacher-2', 'request-1'), {
    code: 'SCORE_EVENT_NOT_FOUND',
  });
  await assert.rejects(harness().service.getByBusinessKey('class-2', 'teacher-1', 'request-1'), {
    code: 'SCORE_EVENT_NOT_FOUND',
  });
});
