import type { DisplayScoreTimeline } from '@/lib/domain';

/** Cumulative snapshots must come from an authorized history source, never current-score guesses. */
export type ScoreTimelineRecord = DisplayScoreTimeline['students'][number]['records'][number];
export type ScoreTimelineStudent = DisplayScoreTimeline['students'][number];
export type ScoreTimelineData = Omit<
  DisplayScoreTimeline,
  'periods' | 'termStartAt' | 'termEndAt'
> & {
  periods?: DisplayScoreTimeline['periods'];
  termStartAt?: number | null;
  termEndAt?: number | null;
};

export interface ScoreTimelinePeriod {
  id: string | null;
  startAt: number;
  endAt: number;
  initialScore: number;
}

export const SCORE_RANGES = ['今日', '本周', '本月', '本学期', '全部'] as const;
export type ScoreRange = (typeof SCORE_RANGES)[number];
const TAIPEI_OFFSET = 8 * 60 * 60 * 1000;

export function rangeStart(
  range: ScoreRange,
  now: number,
  termStart?: number | null,
): number | null {
  const date = new Date(now + TAIPEI_OFFSET);
  date.setUTCHours(0, 0, 0, 0);
  if (range === '全部') return -Infinity;
  if (range === '本学期') return termStart ?? null;
  if (range === '本月') date.setUTCDate(1);
  if (range === '本周') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.getTime() - TAIPEI_OFFSET;
}

export function rangeEnd(range: ScoreRange, now: number, termEnd?: number | null): number {
  if (range !== '本学期' || termEnd == null) return now;
  return Math.min(now, termEnd - 1);
}

export function scoreRange(
  student: ScoreTimelineStudent,
  start: number,
  end: number,
  periods: ScoreTimelinePeriod[] = [],
) {
  const records = student.records
    .filter((record) => record.at <= end)
    .toSorted((a, b) => a.at - b.at);
  if (!periods.length) {
    const before = records.filter((record) => record.at < start).at(-1);
    const initial = before?.score ?? student.initialScore;
    const visible = records.filter((record) => record.at >= start);
    const current = visible.at(-1)?.score ?? initial;
    const delta = current - initial;
    return {
      initial,
      current,
      delta,
      percent: initial > 0 ? (delta / initial) * 100 : null,
      records: visible,
      points: visible.length
        ? [
            { at: Math.max(start, student.initialAt), score: initial },
            ...visible,
            ...(visible.at(-1)!.at < end ? [{ at: end, score: current }] : []),
          ]
        : [],
      high: Math.max(initial, ...visible.map((record) => record.score)),
      low: Math.min(initial, ...visible.map((record) => record.score)),
    };
  }

  const availablePeriods = periods.filter((period) => period.startAt <= end);
  const firstPeriod = availablePeriods[0];
  if (!firstPeriod) {
    return {
      initial: student.initialScore,
      current: student.initialScore,
      delta: 0,
      percent: student.initialScore > 0 ? 0 : null,
      records: [],
      points: [],
      high: student.initialScore,
      low: student.initialScore,
    };
  }
  const cursor = start === -Infinity ? firstPeriod.startAt : start;
  const periodAtStart =
    [...availablePeriods].reverse().find((period) => period.startAt <= cursor) ?? firstPeriod;
  const startScore = scoreAt(student, periodAtStart, cursor, records);
  const visible = records.filter((record) => record.at >= start);
  const periodResets = availablePeriods
    .filter((period) => period.startAt > cursor && period.startAt <= end)
    .map((period) => ({
      at: period.startAt,
      score: period.initialScore,
      periodStartAt: period.startAt,
    }));
  const ledgerPoints = visible.map((record) => ({
    ...record,
    periodStartAt: periodFor(periods, record.at)?.startAt,
  }));
  const orderedPoints = [...periodResets, ...ledgerPoints]
    .filter((point) => point.at <= end)
    .sort((left, right) => left.at - right.at);
  let activePeriod = periodAtStart;
  let current = startScore;
  const points: Array<{ at: number; score: number }> = [
    { at: Math.max(start, activePeriod.startAt), score: startScore },
  ];
  for (const point of orderedPoints) {
    if ('periodStartAt' in point && point.periodStartAt !== undefined) {
      activePeriod =
        periods.find((period) => period.startAt === point.periodStartAt) ?? activePeriod;
    }
    current = point.score;
    points.push({ at: point.at, score: current });
  }
  if (points.at(-1)!.at < end) points.push({ at: end, score: current });
  const initial = startScore;
  const delta = current - initial;
  const values = points.map((point) => point.score);
  return {
    initial,
    current,
    delta,
    percent: initial > 0 ? (delta / initial) * 100 : null,
    records: visible,
    points: visible.length ? points : [],
    high: Math.max(...values),
    low: Math.min(...values),
  };
}

function periodFor(periods: ScoreTimelinePeriod[], at: number): ScoreTimelinePeriod | undefined {
  return [...periods].reverse().find((period) => period.startAt <= at && period.endAt > at);
}

function scoreAt(
  student: ScoreTimelineStudent,
  period: ScoreTimelinePeriod,
  at: number,
  records: ScoreTimelineRecord[],
): number {
  const before = records
    .filter(
      (record) =>
        record.at < at &&
        record.at >= period.startAt &&
        record.at < period.endAt &&
        (record.periodId == null || period.id == null || record.periodId === period.id),
    )
    .at(-1);
  return before?.score ?? period.initialScore ?? student.initialScore;
}

export function nearestRecord(records: ScoreTimelineRecord[], at: number) {
  return records.reduce<ScoreTimelineRecord | null>(
    (nearest, record) =>
      !nearest || Math.abs(record.at - at) < Math.abs(nearest.at - at) ? record : nearest,
    null,
  );
}
