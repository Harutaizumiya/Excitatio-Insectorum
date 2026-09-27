import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rangeStart,
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
