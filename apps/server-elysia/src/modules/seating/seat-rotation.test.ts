import assert from 'node:assert/strict';
import test from 'node:test';
import { rotateOccupiedSeatsRight, type RotationSeat } from './seat-rotation';

const seat = (
  rowIndex: number,
  colIndex: number,
  studentId: string | null,
  cellType: RotationSeat['cellType'] = 'SEAT',
): RotationSeat => ({ rowIndex, colIndex, studentId, cellType });

test('rotates occupied SEAT cells by column while preserving gaps and non-seat cells', () => {
  const result = rotateOccupiedSeatsRight([
    seat(0, 0, 'student-a'),
    seat(0, 1, null),
    seat(0, 2, 'student-b'),
    seat(0, 3, 'aisle-student', 'AISLE'),
    seat(0, 4, 'student-c'),
    seat(1, 0, 'student-only'),
    seat(2, 0, 'student-d'),
    seat(2, 1, 'student-e'),
  ]);

  assert.deepEqual(result.rotatedRows, [0, 2]);
  assert.deepEqual(
    result.seats.map((item) => item.studentId),
    [
      'student-c',
      null,
      'student-a',
      'aisle-student',
      'student-b',
      'student-only',
      'student-e',
      'student-d',
    ],
  );
  assert.equal(result.seats[3]?.cellType, 'AISLE');
});

test('leaves rows with zero or one occupied SEAT unchanged', () => {
  const input = [seat(0, 0, null), seat(1, 0, 'student-only'), seat(2, 0, null, 'AISLE')];
  const result = rotateOccupiedSeatsRight(input);

  assert.deepEqual(result.rotatedRows, []);
  assert.deepEqual(result.seats, input);
});

test('uses only occupied seats when a row contains empty seat cells', () => {
  const result = rotateOccupiedSeatsRight([
    seat(0, 1, 'student-left'),
    seat(0, 3, null),
    seat(0, 5, 'student-right'),
  ]);

  assert.deepEqual(result.seats, [
    seat(0, 1, 'student-right'),
    seat(0, 3, null),
    seat(0, 5, 'student-left'),
  ]);
});
