import assert from 'node:assert/strict';
import test from 'node:test';
import { ScoreEventType, ScoreRecordType, StudentStatus } from '@prisma/client';
import { BusinessError } from '../../plugins/error-handler';
import {
  BehaviorSummaryService,
  aggregateBehaviorSummary,
  buildBehaviorReports,
  parseBehaviorSummaryMonth,
  type BehaviorSummaryRecord,
  type SummaryDatabase,
} from './behavior-summary.service';

const record = (
  delta: number,
  options: {
    event?: ScoreEventType;
    group?: string;
  } = {},
): BehaviorSummaryRecord => ({
  delta,
  event: options.event ? { type: options.event } : null,
  rule: options.group ? { group: options.group } : null,
});

test('aggregates mixed positive and negative records and applies event-first classification', () => {
  const summary = aggregateBehaviorSummary([
    record(8, { event: ScoreEventType.HOMEWORK_PRAISE, group: '不应使用的规则分组' }),
    record(-3, { event: ScoreEventType.LATE }),
    record(-1, { group: '纪律' }),
    record(4, { group: '自定义规则分组' }),
    record(-2),
  ]);

  assert.deepEqual(summary.metrics, {
    effectiveRecordCount: 5,
    positiveCount: 2,
    negativeCount: 3,
    positiveDelta: 12,
    negativeDelta: -6,
    netDelta: 6,
  });
  assert.deepEqual(
    summary.dimensions.map(({ key, label, netDelta }) => ({ key, label, netDelta })),
    [
      { key: 'discipline', label: '纪律规范', netDelta: -4 },
      { key: 'other', label: '其他表现', netDelta: -2 },
      { key: 'learning', label: '学习表现', netDelta: 8 },
      { key: 'rule:自定义规则分组', label: '自定义规则分组', netDelta: 4 },
    ],
  );
});

test('generates deterministic reports for positive-only, negative-only, and empty months', () => {
  const positive = aggregateBehaviorSummary([
    record(3, { event: ScoreEventType.PROGRESS }),
    record(2, { event: ScoreEventType.BLACKBOARD }),
  ]);
  const positiveReports = buildBehaviorReports(
    '测试学生',
    '2026-09',
    positive.metrics,
    positive.dimensions,
  );
  assert.match(positiveReports.teacher, /2 项有效积分事项/);
  assert.match(positiveReports.teacher, /测试学生/);
  assert.match(positiveReports.teacher, /亮点：学习表现/);
  assert.doesNotMatch(positiveReports.teacher, /关注：/);

  const negative = aggregateBehaviorSummary([
    record(-5, { event: ScoreEventType.LATE }),
    record(-2, { event: ScoreEventType.DUTY_HYGIENE }),
  ]);
  const negativeReports = buildBehaviorReports(
    '测试学生',
    '2026-09',
    negative.metrics,
    negative.dimensions,
  );
  assert.match(negativeReports.teacher, /净变化 -7/);
  assert.match(negativeReports.teacher, /关注：纪律规范/);
  assert.doesNotMatch(negativeReports.teacher, /亮点：/);
  assert.doesNotMatch(negativeReports.family, /-?\d+|分|排名|教师|负面/);
  assert.match(negativeReports.family, /该月/);
  assert.doesNotMatch(negativeReports.family, /本月/);
  assert.match(negativeReports.family, /建议/);

  const empty = aggregateBehaviorSummary([]);
  assert.deepEqual(buildBehaviorReports('测试学生', '2026-09', empty.metrics, empty.dimensions), {
    teacher: '2026-09，测试学生暂无积分事项。',
    family: '2026-09，测试学生暂无积分事项，可继续保持日常学习与生活节奏。',
  });
});

test('orders at most two highlights and concerns by the fixed tie-breakers', () => {
  const summary = aggregateBehaviorSummary([
    record(5, { group: '乙' }),
    record(5, { group: '甲' }),
    record(1, { group: '甲' }),
    record(9, { group: '丙' }),
    record(-6, { group: '丁' }),
    record(-3, { group: '戊' }),
    record(-3, { group: '戊' }),
    record(-9, { group: '己' }),
  ]);
  const reports = buildBehaviorReports('测试学生', '2026-09', summary.metrics, summary.dimensions);

  assert.match(reports.teacher, /亮点：丙（正向 9 分，1 项）、甲（正向 6 分，2 项）/);
  assert.match(reports.teacher, /关注：己（需关注 9 分，1 项）、戊（需关注 6 分，2 项）/);
  assert.doesNotMatch(reports.teacher, /亮点[^。]*乙/);
  assert.doesNotMatch(reports.teacher, /关注[^。]*丁/);
});

test('parses Taipei calendar month as a half-open UTC range and defaults in Taipei', () => {
  const september = parseBehaviorSummaryMonth('2026-09');
  assert.equal(september.startAt.toISOString(), '2026-08-31T16:00:00.000Z');
  assert.equal(september.endAt.toISOString(), '2026-09-30T16:00:00.000Z');
  assert.equal(september.timeZone, 'Asia/Taipei');

  assert.equal(
    parseBehaviorSummaryMonth(undefined, new Date('2026-09-30T16:00:00.000Z')).month,
    '2026-10',
  );
  assert.throws(
    () => parseBehaviorSummaryMonth('2026-13'),
    (error: unknown) =>
      error instanceof BusinessError &&
      error.code === 'INVALID_BEHAVIOR_SUMMARY_MONTH' &&
      error.status === 400,
  );
});

test('queries only effective normal records in the Taipei month and falls back to createdAt', async () => {
  let scoreQuery: unknown;
  const database = createDatabase({
    onScoreQuery: (query) => {
      scoreQuery = query;
    },
    records: [record(6, { event: ScoreEventType.PROGRESS })],
  });
  const summary = await new BehaviorSummaryService(database).getSummary(
    'class-1',
    'student-1',
    '2026-09',
  );

  assert.equal(summary.student.status, StudentStatus.INACTIVE);
  assert.equal(summary.student.deletedAt, '2026-08-01T00:00:00.000Z');
  assert.equal(summary.metrics.netDelta, 6);
  assert.deepEqual(scoreQuery, {
    where: {
      classId: 'class-1',
      studentId: 'student-1',
      recordType: ScoreRecordType.NORMAL,
      reversion: null,
      OR: [
        {
          occurredAt: {
            gte: new Date('2026-08-31T16:00:00.000Z'),
            lt: new Date('2026-09-30T16:00:00.000Z'),
          },
        },
        {
          occurredAt: null,
          createdAt: {
            gte: new Date('2026-08-31T16:00:00.000Z'),
            lt: new Date('2026-09-30T16:00:00.000Z'),
          },
        },
      ],
    },
    select: {
      delta: true,
      event: { select: { type: true } },
      rule: { select: { group: true } },
    },
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
});

test('returns STUDENT_NOT_FOUND for missing or cross-class students', async (t) => {
  for (const label of ['missing student', 'student from another class']) {
    await t.test(label, async () => {
      const database = createDatabase({ student: null });
      await assert.rejects(
        () => new BehaviorSummaryService(database).getSummary('class-1', 'student-2', '2026-09'),
        (error: unknown) =>
          error instanceof BusinessError &&
          error.code === 'STUDENT_NOT_FOUND' &&
          error.status === 404,
      );
    });
  }
});

function createDatabase(
  options: {
    student?: Awaited<ReturnType<SummaryDatabase['student']['findFirst']>>;
    records?: BehaviorSummaryRecord[];
    onScoreQuery?: (query: unknown) => void;
  } = {},
): SummaryDatabase {
  const student =
    options.student === undefined
      ? {
          id: 'student-1',
          name: '测试学生',
          studentNo: '001',
          status: StudentStatus.INACTIVE,
          deletedAt: new Date('2026-08-01T00:00:00.000Z'),
        }
      : options.student;
  return {
    student: {
      findFirst: async () => student,
    },
    scoreRecord: {
      findMany: async (query) => {
        options.onScoreQuery?.(query);
        return options.records ?? [];
      },
    },
  };
}
