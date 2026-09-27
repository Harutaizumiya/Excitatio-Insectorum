/** Cumulative snapshots must come from an authorized history source, never current-score guesses. */
export interface ScoreTimelineRecord {
  id: string;
  at: number;
  score: number;
  delta: number;
  reason: string;
}

export interface ScoreTimelineStudent {
  id: string;
  name: string;
  currentScore: number;
  initialAt: number;
  initialScore: number;
  records: ScoreTimelineRecord[];
}

export interface ScoreTimelineData {
  classId: string;
  asOf: number;
  termStartAt?: number;
  students: ScoreTimelineStudent[];
  classAverage: Array<{ at: number; score: number }>;
}

export const SCORE_RANGES = ['今日', '本周', '本月', '本学期', '全部'] as const;
export type ScoreRange = (typeof SCORE_RANGES)[number];
const TAIPEI_OFFSET = 8 * 60 * 60 * 1000;

export function rangeStart(range: ScoreRange, now: number, termStart?: number): number | null {
  const date = new Date(now + TAIPEI_OFFSET);
  date.setUTCHours(0, 0, 0, 0);
  if (range === '全部') return -Infinity;
  if (range === '本学期') return termStart ?? null;
  if (range === '本月') date.setUTCDate(1);
  if (range === '本周') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.getTime() - TAIPEI_OFFSET;
}

export function scoreRange(student: ScoreTimelineStudent, start: number, end: number) {
  const records = student.records
    .filter((record) => record.at <= end)
    .toSorted((a, b) => a.at - b.at);
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

export function nearestRecord(records: ScoreTimelineRecord[], at: number) {
  return records.reduce<ScoreTimelineRecord | null>(
    (nearest, record) =>
      !nearest || Math.abs(record.at - at) < Math.abs(nearest.at - at) ? record : nearest,
    null,
  );
}
