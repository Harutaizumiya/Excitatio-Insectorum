import { ScoreEventType } from '@prisma/client';

export interface ScoreRecordEventSummary {
  type: ScoreEventType;
  minutesLate: number | null;
}

interface StoredEventParameters {
  minutesLate?: unknown;
}

export function summarizeScoreEvent(
  event: { type: ScoreEventType; parameters: string | null } | null,
): ScoreRecordEventSummary | null {
  if (!event) return null;

  let parameters: StoredEventParameters = {};
  if (event.parameters) {
    try {
      const parsed: unknown = JSON.parse(event.parameters);
      if (typeof parsed === 'object' && parsed !== null) {
        parameters = parsed as StoredEventParameters;
      }
    } catch {
      // Keep the event type available even when legacy parameters are malformed.
    }
  }

  return {
    type: event.type,
    minutesLate:
      typeof parameters.minutesLate === 'number' &&
      Number.isInteger(parameters.minutesLate) &&
      parameters.minutesLate > 0
        ? parameters.minutesLate
        : null,
  };
}
