import assert from 'node:assert/strict';
import test from 'node:test';
import { StudentStatus, type PrismaClient } from '@prisma/client';
import {
  ScorePeriodsService,
  buildCommitteeRewards,
  normalizeCommitteeAssignments,
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

test('due settlement isolates missing operators and failed periods', async () => {
  const settledCalls: Array<{ classId: string; periodId: string; operatorId?: string }> = [];
  const service = new ScorePeriodsService({
    scorePeriod: {
      findMany: async (args: { distinct?: string[]; where?: { classId?: string } }) => {
        if (args.distinct)
          return [
            { classId: 'class-ok' },
            { classId: 'class-skipped' },
            { classId: 'class-failed' },
          ];
        if (args.where?.classId === 'class-ok') return [{ id: 'period-1' }, { id: 'period-2' }];
        if (args.where?.classId === 'class-failed') return [{ id: 'period-fail' }];
        return [];
      },
    },
    classTeacher: {
      findFirst: async (args: { where?: { classId?: string } }) =>
        args.where?.classId === 'class-skipped'
          ? null
          : { teacherId: `teacher-${args.where?.classId}` },
    },
  } as unknown as PrismaClient);
  service.settlePeriod = async (classId, periodId, operatorId) => {
    settledCalls.push({ classId, periodId, operatorId });
    if (periodId === 'period-fail') throw new Error('simulated period failure');
    return {} as never;
  };

  const result = await service.settleAllDuePeriods(new Date('2026-10-01T00:00:00.000Z'));

  assert.deepEqual(result, { settled: 2, skipped: 1, failed: 1 });
  assert.deepEqual(settledCalls, [
    { classId: 'class-ok', periodId: 'period-1', operatorId: 'teacher-class-ok' },
    { classId: 'class-ok', periodId: 'period-2', operatorId: 'teacher-class-ok' },
    { classId: 'class-failed', periodId: 'period-fail', operatorId: 'teacher-class-failed' },
  ]);
});
