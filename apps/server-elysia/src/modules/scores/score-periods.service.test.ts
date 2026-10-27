import assert from 'node:assert/strict';
import test from 'node:test';
import { ScorePeriodStatus, StudentStatus, type PrismaClient } from '@prisma/client';
import {
  ScorePeriodsService,
  buildCommitteeRewards,
  computeSettlementBoundary,
  isSettlementBoundary,
  normalizeCommitteeAssignments,
  normalizeSettlementDates,
} from './score-periods.service';

const period = {
  startAt: new Date('2026-09-01T00:00:00.000Z'),
  endAt: new Date('2026-10-01T00:00:00.000Z'),
};

test('committee rewards keep multiple roles but only reward the same role once', () => {
  const rewards = buildCommitteeRewards(
    [
      {
        studentId: 'student-1',
        role: '班长',
        termStartAt: new Date('2026-08-01T00:00:00.000Z'),
        termEndAt: null,
        trialEndsAt: null,
        studentStatus: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      {
        studentId: 'student-1',
        role: '班长',
        termStartAt: new Date('2026-08-15T00:00:00.000Z'),
        termEndAt: null,
        trialEndsAt: null,
        studentStatus: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      {
        studentId: 'student-1',
        role: '学习委员',
        termStartAt: new Date('2026-08-01T00:00:00.000Z'),
        termEndAt: null,
        trialEndsAt: null,
        studentStatus: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      {
        studentId: 'student-2',
        role: '团支书',
        termStartAt: new Date('2026-08-01T00:00:00.000Z'),
        termEndAt: null,
        trialEndsAt: null,
        studentStatus: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      {
        studentId: 'student-3',
        role: '班长',
        termStartAt: new Date('2026-08-01T00:00:00.000Z'),
        termEndAt: null,
        trialEndsAt: new Date('2026-10-02T00:00:00.000Z'),
        studentStatus: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      {
        studentId: 'student-4',
        role: '班长',
        termStartAt: new Date('2026-08-01T00:00:00.000Z'),
        termEndAt: new Date('2026-09-01T00:00:00.000Z'),
        trialEndsAt: null,
        studentStatus: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      {
        studentId: 'student-5',
        role: '班长',
        termStartAt: new Date('2026-08-01T00:00:00.000Z'),
        termEndAt: null,
        trialEndsAt: null,
        studentStatus: StudentStatus.INACTIVE,
        deletedAt: null,
      },
      {
        studentId: 'student-6',
        role: '班长',
        termStartAt: new Date('2026-08-01T00:00:00.000Z'),
        termEndAt: null,
        trialEndsAt: null,
        studentStatus: StudentStatus.ACTIVE,
        deletedAt: new Date('2026-09-10T00:00:00.000Z'),
      },
      {
        studentId: 'student-7',
        role: '班长',
        termStartAt: new Date('2026-08-01T00:00:00.000Z'),
        termEndAt: null,
        trialEndsAt: null,
        studentStatus: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      {
        studentId: 'student-8',
        role: '班长',
        termStartAt: new Date('2026-08-01T00:00:00.000Z'),
        termEndAt: new Date('2026-09-15T00:00:00.000Z'),
        trialEndsAt: null,
        studentStatus: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      {
        studentId: 'student-7',
        role: '班长',
        termStartAt: new Date('2026-08-15T00:00:00.000Z'),
        termEndAt: null,
        trialEndsAt: new Date('2026-10-02T00:00:00.000Z'),
        studentStatus: StudentStatus.ACTIVE,
        deletedAt: null,
      },
    ],
    new Set(['student-2']),
    period,
  );

  assert.deepEqual(rewards, [
    { studentId: 'student-1', delta: 10, role: '班长' },
    { studentId: 'student-1', delta: 4, role: '学习委员' },
    { studentId: 'student-2', delta: 10, role: '团支书' },
    { studentId: 'student-8', delta: 10, role: '班长' },
  ]);
});

test('committee assignment end time must be later than its start time', () => {
  assert.throws(
    () =>
      normalizeCommitteeAssignments([
        {
          studentId: 'student-1',
          role: '班长',
          termStartAt: '2026-09-01T00:00:00.000Z',
          termEndAt: '2026-09-01T00:00:00.000Z',
        },
      ]),
    /任职结束时间必须晚于任职开始时间/,
  );
});

test('due settlement follows configured settlement dates and isolates failures', async () => {
  const settledCalls: Array<{ classId: string; periodId: string; operatorId?: string }> = [];
  const openedBoundaries: Array<{ classId: string; startAt: Date; endAt: Date }> = [];
  const periodRows: Record<string, unknown[]> = {
    'class-ok': [
      {
        id: 'period-before-config',
        startAt: new Date('2026-08-14T16:00:00.000Z'),
        endAt: new Date('2026-08-14T16:00:00.000Z'),
        initialScore: 100,
        status: ScorePeriodStatus.OPEN,
        settledAt: null,
      },
      {
        id: 'period-1',
        startAt: new Date('2026-08-31T16:00:00.000Z'),
        endAt: new Date('2026-09-14T16:00:00.000Z'),
        initialScore: 100,
        status: ScorePeriodStatus.OPEN,
        settledAt: null,
      },
      {
        id: 'period-2',
        startAt: new Date('2026-09-14T16:00:00.000Z'),
        endAt: new Date('2026-09-30T16:00:00.000Z'),
        initialScore: 100,
        status: ScorePeriodStatus.OPEN,
        settledAt: null,
      },
    ],
    'class-failed': [
      {
        id: 'period-fail',
        startAt: new Date('2026-09-14T16:00:00.000Z'),
        endAt: new Date('2026-09-30T16:00:00.000Z'),
        initialScore: 100,
        status: ScorePeriodStatus.OPEN,
        settledAt: null,
      },
    ],
  };
  const service = new ScorePeriodsService({
    scoreSettlementConfig: {
      findMany: async () => [
        {
          classId: 'class-ok',
          dates: '["2026-09-15","2026-10-01","2026-10-15"]',
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        {
          classId: 'class-skipped',
          dates: '["2026-10-01"]',
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        {
          classId: 'class-failed',
          dates: '["2026-10-01","2026-11-01"]',
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ],
    },
    classTeacher: {
      findFirst: async (args: { where?: { classId?: string } }) =>
        args.where?.classId === 'class-skipped'
          ? null
          : { teacherId: `teacher-${args.where?.classId}` },
    },
    scorePeriod: {
      findMany: async (args: { where?: { classId?: string } }) =>
        periodRows[args.where?.classId ?? ''] ?? [],
    },
  } as unknown as PrismaClient);
  service.settlePeriod = async (classId, periodId, operatorId) => {
    settledCalls.push({ classId, periodId, operatorId });
    if (periodId === 'period-fail') throw new Error('simulated period failure');
    return {} as never;
  };
  service['getOrCreatePeriod'] = async (classId, boundary) => {
    openedBoundaries.push({ classId, ...boundary });
    return {} as never;
  };

  const result = await service.settleAllDuePeriods(new Date('2026-10-14T16:00:00.000Z'));

  assert.deepEqual(result, { settled: 2, skipped: 1, failed: 1 });
  assert.deepEqual(settledCalls, [
    { classId: 'class-ok', periodId: 'period-1', operatorId: 'teacher-class-ok' },
    { classId: 'class-ok', periodId: 'period-2', operatorId: 'teacher-class-ok' },
    { classId: 'class-failed', periodId: 'period-fail', operatorId: 'teacher-class-failed' },
  ]);
  assert.deepEqual(
    openedBoundaries.map((item) => [
      item.classId,
      item.startAt.toISOString(),
      item.endAt.toISOString(),
    ]),
    [
      ['class-ok', '2026-09-30T16:00:00.000Z', '2026-10-14T16:00:00.000Z'],
      ['class-failed', '2026-09-30T16:00:00.000Z', '2026-10-31T16:00:00.000Z'],
    ],
  );
});

test('settlement boundaries follow explicit dates', () => {
  assert.deepEqual(
    normalizeSettlementDates([
      '2026-11-15',
      '2026-10-01',
      '2026-11-15',
      '2026-02-30',
      'bad',
      '2026-13-01',
    ]),
    ['2026-10-01', '2026-11-15'],
  );

  const midMonth = computeSettlementBoundary(
    ['2026-10-10', '2026-11-10'],
    new Date('2026-10-12T00:00:00+08:00'),
  );
  assert.equal(midMonth.startAt?.toISOString(), '2026-10-09T16:00:00.000Z');
  assert.equal(midMonth.endAt.toISOString(), '2026-11-09T16:00:00.000Z');

  const beforeAllDates = computeSettlementBoundary(
    ['2026-10-10', '2026-11-10'],
    new Date('2026-10-05T00:00:00+08:00'),
  );
  assert.equal(beforeAllDates.startAt, null);
  assert.equal(beforeAllDates.endAt.toISOString(), '2026-10-09T16:00:00.000Z');

  const afterAllDates = computeSettlementBoundary(
    ['2026-10-10', '2026-11-10'],
    new Date('2026-12-01T00:00:00+08:00'),
  );
  assert.equal(afterAllDates.startAt?.toISOString(), '2026-11-09T16:00:00.000Z');
  assert.equal(afterAllDates.endAt.toISOString(), '9999-12-31T23:59:59.999Z');

  assert.equal(isSettlementBoundary(['2026-02-28'], new Date('2026-02-28T00:00:00+08:00')), true);
  assert.equal(isSettlementBoundary(['2026-02-28'], new Date('2026-03-01T00:00:00+08:00')), false);
  assert.equal(isSettlementBoundary(['2026-10-15'], new Date('2026-10-15T00:00:00+08:00')), true);
});

test('first enabling updates open period end to the next settlement boundary without creating orphaned periods', async () => {
  const updatedEnds: Date[] = [];
  const createdPeriods: Array<{ startAt: Date; endAt: Date }> = [];
  const openPeriod = {
    id: 'open-period',
    startAt: new Date('2026-01-01T00:00:00.000Z'),
    endAt: new Date('9999-12-31T23:59:59.999Z'),
    initialScore: 100,
    status: ScorePeriodStatus.OPEN,
    settledAt: null,
  };
  const tx = {
    scoreSettlementConfig: {
      findUnique: async () => ({ enabled: false }),
      upsert: async () => ({ enabled: true, dates: '["2099-01-15"]', updatedAt: new Date() }),
    },
    scorePeriod: {
      findFirst: async () => openPeriod,
      update: async (args: { data: { endAt: Date } }) => {
        updatedEnds.push(args.data.endAt);
      },
      upsert: async (args: { create: { startAt: Date; endAt: Date } }) => {
        createdPeriods.push(args.create);
        return { id: 'next-period' };
      },
      findUnique: async () => null,
    },
  };
  const service = new ScorePeriodsService({
    $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaClient);

  const result = await service.saveSettlementConfig('class-1', {
    enabled: true,
    dates: ['2099-01-15'],
  });

  assert.equal(result.enabled, true);
  assert.deepEqual(result.dates, ['2099-01-15']);
  assert.equal(updatedEnds.length, 1);
  assert.equal(isSettlementBoundary(['2099-01-15'], updatedEnds[0]!), true);
  assert.equal(createdPeriods.length, 0);
});

test('range summary only counts records inside the selected days', async () => {
  const recordQueries: Array<{ where?: Record<string, unknown> }> = [];
  const service = new ScorePeriodsService({
    student: {
      findMany: async () => [
        { id: 'student-1', name: '张三' },
        { id: 'student-2', name: '李四' },
      ],
    },
    scoreRecord: {
      findMany: async (args: { where?: Record<string, unknown> }) => {
        recordQueries.push(args);
        return [
          { studentId: 'student-1', delta: 3 },
          { studentId: 'student-2', delta: -1 },
        ];
      },
    },
  } as unknown as PrismaClient);

  const periodRow = {
    id: 'period-1',
    startAt: new Date('2026-10-01T00:00:00.000Z'),
    endAt: new Date('2026-11-01T00:00:00.000Z'),
    initialScore: 100,
    status: ScorePeriodStatus.OPEN,
    settledAt: null,
  };
  const range = {
    startAt: new Date('2026-10-10T00:00:00.000Z'),
    endAt: new Date('2026-10-10T23:59:59.999Z'),
  };

  const summary = await service['buildSummary'](
    'class-1',
    [periodRow as never],
    periodRow as never,
    range,
  );

  assert.deepEqual(recordQueries[0]?.where, {
    classId: 'class-1',
    periodId: { in: ['period-1'] },
    occurredAt: { gte: range.startAt, lte: range.endAt },
  });
  assert.deepEqual(
    summary.students.map((student) => [student.studentId, student.score]),
    [
      ['student-1', 103],
      ['student-2', 99],
    ],
  );
});

test('getOrCreateSettlementPeriod reuses running open period', async () => {
  const existingPeriod = {
    id: 'open-period-1',
    startAt: new Date('2026-10-01T00:00:00.000Z'),
    endAt: new Date('2026-11-01T00:00:00.000Z'),
    initialScore: 100,
    status: ScorePeriodStatus.OPEN,
    settledAt: null,
  };
  let created = false;
  const service = new ScorePeriodsService({
    scorePeriod: {
      findFirst: async () => existingPeriod,
      upsert: async () => {
        created = true;
        return { id: 'should-not-be-called' };
      },
    },
  } as unknown as PrismaClient);

  const period = await service['getOrCreateSettlementPeriod'](
    'class-1',
    new Date('2026-10-15T00:00:00.000Z'),
    {
      startAt: new Date('2026-10-01T00:00:00.000Z'),
      endAt: new Date('2026-11-01T00:00:00.000Z'),
    },
  );

  assert.equal(period.id, 'open-period-1');
  assert.equal(created, false);
});
