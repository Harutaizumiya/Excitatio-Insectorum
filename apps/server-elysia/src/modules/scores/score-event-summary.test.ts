import assert from 'node:assert/strict';
import test from 'node:test';
import { ScoreEventType } from '@prisma/client';
import { summarizeScoreEvent } from './score-event-summary';

test('summarizes a late event with its minutes', () => {
  assert.deepEqual(
    summarizeScoreEvent({
      type: ScoreEventType.LATE,
      parameters: JSON.stringify({ minutesLate: 2 }),
    }),
    { type: ScoreEventType.LATE, minutesLate: 2 },
  );
});

test('keeps event type when event parameters are unavailable', () => {
  assert.deepEqual(summarizeScoreEvent({ type: ScoreEventType.LATE, parameters: null }), {
    type: ScoreEventType.LATE,
    minutesLate: null,
  });
});
