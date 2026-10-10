import assert from 'node:assert/strict';
import test from 'node:test';
import { ScoreRecordType } from '@prisma/client';
import { buildDisplayScoreTimeline, configuredTaipeiTerm } from './display-score-history.service';

const date = (value: string) => new Date(value);

test('Taipei term dates use local midnight and an inclusive end date', () => {
  const term = configuredTaipeiTerm('2026-09-01', '2027-01-31');
  assert.deepEqual(term, {
    termStartAt: date('2026-09-01T00:00:00+08:00').getTime(),
    termEndAt: date('2027-02-01T00:00:00+08:00').getTime(),
  });
  assert.deepEqual(configuredTaipeiTerm(null, null), {
    termStartAt: null,
    termEndAt: null,
  });
});

test('display history replays monthly baselines, normal and revert rows for the active roster', () => {
  const result = buildDisplayScoreTimeline({
    classId: 'class-1',
    asOf: date('2026-11-10T00:00:00+08:00'),
    termStartDate: '2026-09-01',
    termEndDate: '2027-01-31',
    students: [
      { id: 'student-a', name: '小明' },
      { id: 'student-b', name: '小華' },
    ],
    periods: [
      {
        id: 'period-sep',
        startAt: date('2026-09-01T00:00:00+08:00'),
        endAt: date('2026-10-01T00:00:00+08:00'),
        initialScore: 100,
      },
      {
        id: 'period-nov',
        startAt: date('2026-11-01T00:00:00+08:00'),
        endAt: date('2026-12-01T00:00:00+08:00'),
        initialScore: 90,
      },
    ],
    records: [
      {
        id: 'a-plus',
        studentId: 'student-a',
        periodId: 'period-sep',
        delta: 5,
        reason: '课堂表现',
        recordType: ScoreRecordType.NORMAL,
        occurredAt: date('2026-09-05T10:00:00+08:00'),
        createdAt: date('2026-09-05T10:00:00+08:00'),
      },
      {
        id: 'b-minus',
        studentId: 'student-b',
        periodId: 'period-sep',
        delta: -2,
        reason: '忘带作业',
        recordType: ScoreRecordType.NORMAL,
        occurredAt: date('2026-09-05T10:00:00+08:00'),
        createdAt: date('2026-09-05T10:00:00+08:00'),
      },
      {
        id: 'a-revert',
        studentId: 'student-a',
        periodId: 'period-sep',
        delta: -5,
        reason: null,
        recordType: ScoreRecordType.REVERT,
        revertedRecordId: 'a-plus',
        occurredAt: null,
        createdAt: date('2026-09-08T10:00:00+08:00'),
      },
      {
        id: 'a-nov',
        studentId: 'student-a',
        periodId: 'period-nov',
        delta: 3,
        reason: '课堂表现',
        recordType: ScoreRecordType.NORMAL,
        occurredAt: date('2026-11-02T10:00:00+08:00'),
        createdAt: date('2026-11-02T10:00:00+08:00'),
      },
      {
        id: 'inactive-row',
        studentId: 'inactive-student',
        periodId: 'period-sep',
        delta: 100,
        reason: '不进入当前 ACTIVE 名单均分',
        recordType: ScoreRecordType.NORMAL,
        occurredAt: date('2026-09-06T10:00:00+08:00'),
        createdAt: date('2026-09-06T10:00:00+08:00'),
      },
    ],
  });

  assert.deepEqual(
    result.periods.map((period) => period.id),
    ['period-sep', null, 'period-nov'],
  );
  assert.deepEqual(
    result.students.map(({ id, currentScore }) => [id, currentScore]),
    [
      ['student-a', 93],
      ['student-b', 90],
    ],
  );
  assert.deepEqual(
    result.students[0].records.map(({ id, score }) => [id, score]),
    [
      ['a-plus', 105],
      ['a-revert', 100],
      ['a-nov', 93],
    ],
  );
  assert.equal(result.students[0].records[1].reason, '撤销积分记录');
  assert.equal(result.students[0].records[1].at, date('2026-09-05T10:00:00+08:00').getTime());
  assert.deepEqual(
    result.classAverage.map(({ score }) => score),
    [100, 99, 100, 90, 91.5],
  );
});

test('cross-month reverts restate the original month only after the revert actually happened', () => {
  const students = [{ id: 'student-a', name: '小明' }];
  const periods = [
    {
      id: 'period-sep',
      startAt: date('2026-09-01T00:00:00+08:00'),
      endAt: date('2026-10-01T00:00:00+08:00'),
      initialScore: 100,
    },
  ];
  const records = [
    {
      id: 'a-plus',
      studentId: 'student-a',
      periodId: 'period-sep',
      delta: 5,
      reason: '课堂表现',
      recordType: ScoreRecordType.NORMAL,
      occurredAt: date('2026-09-25T10:00:00+08:00'),
      createdAt: date('2026-09-25T10:00:00+08:00'),
    },
    {
      id: 'a-later-plus',
      studentId: 'student-a',
      periodId: 'period-sep',
      delta: 2,
      reason: '课堂表现',
      recordType: ScoreRecordType.NORMAL,
      occurredAt: date('2026-09-26T10:00:00+08:00'),
      createdAt: date('2026-09-26T10:00:00+08:00'),
    },
    {
      id: 'a-revert',
      studentId: 'student-a',
      periodId: 'period-sep',
      delta: -5,
      reason: null,
      recordType: ScoreRecordType.REVERT,
      revertedRecordId: 'a-plus',
      occurredAt: date('2026-10-05T10:00:00+08:00'),
      createdAt: date('2026-10-05T10:00:00+08:00'),
    },
  ];
  const build = (asOf: Date) =>
    buildDisplayScoreTimeline({
      classId: 'class-1',
      asOf,
      termStartDate: null,
      termEndDate: null,
      students,
      periods,
      records,
    });

  const beforeRevert = build(date('2026-09-30T23:59:59+08:00'));
  assert.equal(beforeRevert.students[0].currentScore, 107);
  assert.equal(
    beforeRevert.students[0].records.some(({ id }) => id === 'a-revert'),
    false,
  );

  const afterRevert = build(date('2026-11-10T00:00:00+08:00'));
  assert.deepEqual(
    afterRevert.students[0].records.map(({ id, at, score }) => [id, at, score]),
    [
      ['a-plus', date('2026-09-25T10:00:00+08:00').getTime(), 105],
      ['a-revert', date('2026-09-25T10:00:00+08:00').getTime(), 100],
      ['a-later-plus', date('2026-09-26T10:00:00+08:00').getTime(), 102],
    ],
  );
});
