import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rangeStart,
  rangeEnd,
  scoreRange,
  nearestRecord,
} from '../src/features/classroom/display-score-timeline.ts';

const at = (time) => Date.parse(time);
test('Taipei day, Monday week, and month use calendar boundaries', () => {
  const now = at('2026-09-27T23:00:00Z');
  assert.equal(rangeStart('今日', now), at('2026-09-28T00:00:00+08:00'));
  assert.equal(rangeStart('本周', now), at('2026-09-28T00:00:00+08:00'));
  assert.equal(rangeStart('本月', now), at('2026-09-01T00:00:00+08:00'));
});
test('term boundary is never guessed', () => {
  assert.equal(rangeStart('本学期', 100), null);
  assert.equal(rangeStart('本学期', 100, 20), 20);
  assert.equal(rangeStart('全部', 100), -Infinity);
  assert.equal(rangeEnd('本学期', 100, 90), 89);
  assert.equal(rangeEnd('本周', 100, 90), 100);
});
const student = {
  id: 's',
  initialAt: 0,
  initialScore: 100,
  currentScore: 108,
  records: [
    { id: 'a', at: 10, score: 105, delta: 5 },
    { id: 'b', at: 20, score: 103, delta: -2 },
    { id: 'c', at: 80, score: 108, delta: 5 },
  ],
};
test('range baseline is preceding cumulative snapshot, boundary record remains visible', () => {
  const result = scoreRange(student, 20, 90);
  assert.equal(result.initial, 105);
  assert.equal(result.delta, 3);
  assert.deepEqual(
    result.records.map((r) => r.id),
    ['b', 'c'],
  );
  assert.deepEqual(
    result.points.map((r) => r.at),
    [20, 20, 80, 90],
  );
  assert.equal(result.low, 103);
  assert.equal(result.high, 108);
});
test('empty ranges have no fabricated line, current snapshot is not historical input', () => {
  const result = scoreRange({ ...student, currentScore: 999 }, 30, 60);
  assert.deepEqual(result.points, []);
  assert.equal(result.current, 103);
  assert.equal(result.delta, 0);
});
test('non-positive baseline suppresses percentage', () => {
  assert.equal(scoreRange({ ...student, initialScore: 0 }, -Infinity, 90).percent, null);
  assert.equal(scoreRange({ ...student, initialScore: -5 }, -Infinity, 90).percent, null);
});
test('all range starts at known initial time, future records excluded', () => {
  const result = scoreRange(student, -Infinity, 30);
  assert.equal(result.points[0].at, 0);
  assert.equal(result.current, 103);
  assert.equal(result.delta, 3);
});
test('record selection uses elapsed time rather than array spacing', () => {
  assert.equal(nearestRecord(student.records, 45)?.id, 'b');
  assert.equal(nearestRecord(student.records, 65)?.id, 'c');
  assert.equal(nearestRecord([], 1), null);
});

test('period resets are baselines, not ledger records, when building a multi-period range', () => {
  const historyStudent = {
    ...student,
    records: [
      { id: 'sep', periodId: 'sep', at: 90, score: 110, delta: 10, reason: '加分' },
      { id: 'oct', periodId: 'oct', at: 110, score: 103, delta: 3, reason: '加分' },
    ],
  };
  const periods = [
    { id: 'sep', startAt: 0, endAt: 100, initialScore: 100 },
    { id: 'oct', startAt: 100, endAt: 200, initialScore: 100 },
  ];
  const all = scoreRange(historyStudent, -Infinity, 150, periods);
  assert.equal(all.initial, 100);
  assert.equal(all.current, 103);
  assert.equal(all.delta, 3);
  assert.deepEqual(
    all.points.map(({ at, score }) => [at, score]),
    [
      [0, 100],
      [90, 110],
      [100, 100],
      [110, 103],
      [150, 103],
    ],
  );
  assert.deepEqual(
    all.records.map(({ id }) => id),
    ['sep', 'oct'],
  );
  const midMonth = scoreRange(historyStudent, 95, 150, periods);
  assert.equal(midMonth.initial, 110);
  assert.equal(midMonth.delta, -7);
  assert.deepEqual(
    midMonth.records.map(({ id }) => id),
    ['oct'],
  );
});
