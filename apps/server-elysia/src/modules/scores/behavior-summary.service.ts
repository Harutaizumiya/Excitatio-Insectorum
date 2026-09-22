import { ScoreEventType, ScoreRecordType, type StudentStatus } from '@prisma/client';
import { BusinessError } from '../../plugins/error-handler';
import { prisma } from '../../plugins/prisma';

const TIME_ZONE = 'Asia/Taipei' as const;

const EVENT_DIMENSIONS: Record<ScoreEventType, DimensionIdentity> = {
  [ScoreEventType.HOMEWORK_MISSING]: { key: 'learning', label: '学习表现' },
  [ScoreEventType.HOMEWORK_PRAISE]: { key: 'learning', label: '学习表现' },
  [ScoreEventType.EXAM_GRADE_TOP10]: { key: 'learning', label: '学习表现' },
  [ScoreEventType.SUBJECT_TOP3]: { key: 'learning', label: '学习表现' },
  [ScoreEventType.BREAKTHROUGH]: { key: 'learning', label: '学习表现' },
  [ScoreEventType.PROGRESS]: { key: 'learning', label: '学习表现' },
  [ScoreEventType.LATE]: { key: 'discipline', label: '纪律规范' },
  [ScoreEventType.SCHOOL_UNIFORM]: { key: 'discipline', label: '纪律规范' },
  [ScoreEventType.EVENING_SELF_STUDY_CALLOUT]: { key: 'discipline', label: '纪律规范' },
  [ScoreEventType.NO_VIOLATION_REWARD]: { key: 'discipline', label: '纪律规范' },
  [ScoreEventType.NOISIEST_CLASS_TOP3]: { key: 'discipline', label: '纪律规范' },
  [ScoreEventType.ACTIVITY_NEGATIVE]: { key: 'discipline', label: '纪律规范' },
  [ScoreEventType.DUTY_HYGIENE]: { key: 'labor-hygiene', label: '劳动卫生' },
  [ScoreEventType.DORM_HYGIENE]: { key: 'labor-hygiene', label: '劳动卫生' },
  [ScoreEventType.COMMITTEE_TASK_COMPLETED]: { key: 'class-service', label: '班级服务' },
  [ScoreEventType.COMMITTEE_REWARD]: { key: 'class-service', label: '班级服务' },
  [ScoreEventType.BLACKBOARD]: { key: 'activity', label: '活动参与' },
  [ScoreEventType.INDIVIDUAL_ACTIVITY]: { key: 'activity', label: '活动参与' },
  [ScoreEventType.GROUP_ACTIVITY]: { key: 'activity', label: '活动参与' },
  [ScoreEventType.SPORTS_FINAL_TOP8]: { key: 'activity', label: '活动参与' },
  [ScoreEventType.MANUAL]: { key: 'other', label: '其他表现' },
};

const OTHER_DIMENSION = EVENT_DIMENSIONS[ScoreEventType.MANUAL];

const RULE_DIMENSION_ALIASES: Record<string, DimensionIdentity> = {
  学习: EVENT_DIMENSIONS[ScoreEventType.PROGRESS],
  作业练习: EVENT_DIMENSIONS[ScoreEventType.HOMEWORK_PRAISE],
  纪律: EVENT_DIMENSIONS[ScoreEventType.LATE],
  日常纪律: EVENT_DIMENSIONS[ScoreEventType.LATE],
  课堂纪律: EVENT_DIMENSIONS[ScoreEventType.LATE],
  卫生: EVENT_DIMENSIONS[ScoreEventType.DUTY_HYGIENE],
  班委工作: EVENT_DIMENSIONS[ScoreEventType.COMMITTEE_REWARD],
  文体活动: EVENT_DIMENSIONS[ScoreEventType.INDIVIDUAL_ACTIVITY],
};

interface DimensionIdentity {
  key: string;
  label: string;
}

export interface BehaviorSummaryRecord {
  delta: number;
  event: { type: ScoreEventType } | null;
  rule: { group: string } | null;
}

export interface BehaviorSummaryMetrics {
  effectiveRecordCount: number;
  positiveCount: number;
  negativeCount: number;
  positiveDelta: number;
  negativeDelta: number;
  netDelta: number;
}

export interface BehaviorSummaryDimension extends BehaviorSummaryMetrics, DimensionIdentity {}

export interface BehaviorSummaryResponse {
  student: {
    id: string;
    name: string;
    studentNo: string | null;
    status: StudentStatus;
    deletedAt: string | null;
  };
  period: {
    month: string;
    timeZone: typeof TIME_ZONE;
    startAt: string;
    endAt: string;
  };
  metrics: BehaviorSummaryMetrics;
  dimensions: BehaviorSummaryDimension[];
  reports: {
    teacher: string;
    family: string;
  };
}

export interface SummaryDatabase {
  student: {
    findFirst(args: unknown): Promise<{
      id: string;
      name: string;
      studentNo: string | null;
      status: StudentStatus;
      deletedAt: Date | null;
    } | null>;
  };
  scoreRecord: {
    findMany(args: unknown): Promise<BehaviorSummaryRecord[]>;
  };
}

export function parseBehaviorSummaryMonth(month?: string, now = new Date()) {
  const resolvedMonth = month ?? getTaipeiMonth(now);
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(resolvedMonth);
  if (!match || Number(match[1]) === 0) {
    throw new BusinessError('INVALID_BEHAVIOR_SUMMARY_MONTH', '月份格式必须为 YYYY-MM', 400);
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  if (nextYear > 9999) {
    throw new BusinessError('INVALID_BEHAVIOR_SUMMARY_MONTH', '月份超出支持范围', 400);
  }

  const startAt = new Date(`${resolvedMonth}-01T00:00:00.000+08:00`);
  const endAt = new Date(
    `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000+08:00`,
  );
  return { month: resolvedMonth, startAt, endAt, timeZone: TIME_ZONE };
}

export function aggregateBehaviorSummary(records: BehaviorSummaryRecord[]) {
  const metrics = emptyMetrics();
  const dimensions = new Map<string, BehaviorSummaryDimension>();

  for (const record of records) {
    const identity = classifyRecord(record);
    const dimensionKey = `${identity.key}\u0000${identity.label}`;
    const dimension = dimensions.get(dimensionKey) ?? { ...identity, ...emptyMetrics() };
    addDelta(metrics, record.delta);
    addDelta(dimension, record.delta);
    dimensions.set(dimensionKey, dimension);
  }

  return {
    metrics,
    dimensions: [...dimensions.values()].sort(
      (left, right) =>
        left.label.localeCompare(right.label, 'zh-CN') || left.key.localeCompare(right.key),
    ),
  };
}

export function buildBehaviorReports(
  studentName: string,
  month: string,
  metrics: BehaviorSummaryMetrics,
  dimensions: BehaviorSummaryDimension[],
) {
  if (metrics.effectiveRecordCount === 0) {
    return {
      teacher: `${month}，${studentName}暂无积分事项。`,
      family: `${month}，${studentName}暂无积分事项，可继续保持日常学习与生活节奏。`,
    };
  }

  const highlights = [...dimensions]
    .filter((dimension) => dimension.positiveCount > 0)
    .sort(
      (left, right) =>
        right.positiveDelta - left.positiveDelta ||
        right.positiveCount - left.positiveCount ||
        left.label.localeCompare(right.label, 'zh-CN'),
    )
    .slice(0, 2);
  const concerns = [...dimensions]
    .filter((dimension) => dimension.negativeCount > 0)
    .sort(
      (left, right) =>
        Math.abs(right.negativeDelta) - Math.abs(left.negativeDelta) ||
        right.negativeCount - left.negativeCount ||
        left.label.localeCompare(right.label, 'zh-CN'),
    )
    .slice(0, 2);

  const teacherParts = [
    `${month}，${studentName}共有 ${metrics.effectiveRecordCount} 项有效积分事项，净变化 ${formatSigned(metrics.netDelta)} 分。`,
  ];
  if (highlights.length > 0) {
    teacherParts.push(
      `亮点：${highlights
        .map(
          (dimension) =>
            `${dimension.label}（正向 ${dimension.positiveDelta} 分，${dimension.positiveCount} 项）`,
        )
        .join('、')}。`,
    );
  }
  if (concerns.length > 0) {
    teacherParts.push(
      `关注：${concerns
        .map(
          (dimension) =>
            `${dimension.label}（需关注 ${Math.abs(dimension.negativeDelta)} 分，${dimension.negativeCount} 项）`,
        )
        .join('、')}。`,
    );
  }

  const familyParts: string[] = [];
  if (highlights.length > 0) {
    familyParts.push(`${studentName}该月在${joinLabels(highlights)}方面有积极表现。`);
  } else {
    familyParts.push(`${studentName}该月已有相关表现记录。`);
  }
  if (concerns.length > 0) {
    familyParts.push(`后续可重点关注${joinLabels(concerns)}方面的习惯养成。`);
  }
  familyParts.push('建议每天设定一个可完成的小目标，并及时复盘。');

  return { teacher: teacherParts.join(''), family: familyParts.join('') };
}

export class BehaviorSummaryService {
  constructor(private readonly database: SummaryDatabase = prisma as unknown as SummaryDatabase) {}

  async getSummary(
    classId: string,
    studentId: string,
    month?: string,
  ): Promise<BehaviorSummaryResponse> {
    const period = parseBehaviorSummaryMonth(month);
    const student = await this.database.student.findFirst({
      where: { id: studentId, classId },
      select: { id: true, name: true, studentNo: true, status: true, deletedAt: true },
    });
    if (!student) throw new BusinessError('STUDENT_NOT_FOUND', '学生不存在', 404);

    const records = await this.database.scoreRecord.findMany({
      where: {
        classId,
        studentId,
        recordType: ScoreRecordType.NORMAL,
        reversion: null,
        OR: [
          { occurredAt: { gte: period.startAt, lt: period.endAt } },
          {
            occurredAt: null,
            createdAt: { gte: period.startAt, lt: period.endAt },
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
    const summary = aggregateBehaviorSummary(records);

    return {
      student: {
        ...student,
        deletedAt: student.deletedAt?.toISOString() ?? null,
      },
      period: {
        month: period.month,
        timeZone: period.timeZone,
        startAt: period.startAt.toISOString(),
        endAt: period.endAt.toISOString(),
      },
      ...summary,
      reports: buildBehaviorReports(
        student.name,
        period.month,
        summary.metrics,
        summary.dimensions,
      ),
    };
  }
}

function getTaipeiMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) {
    throw new BusinessError('INVALID_BEHAVIOR_SUMMARY_MONTH', '无法确定当前月份', 400);
  }
  return `${year}-${month}`;
}

function classifyRecord(record: BehaviorSummaryRecord): DimensionIdentity {
  if (record.event) return EVENT_DIMENSIONS[record.event.type] ?? OTHER_DIMENSION;
  const group = record.rule?.group.trim();
  if (!group) return OTHER_DIMENSION;
  const alias = RULE_DIMENSION_ALIASES[group];
  if (alias) return alias;
  const known = Object.values(EVENT_DIMENSIONS).find((dimension) => dimension.label === group);
  return known ?? { key: `rule:${group}`, label: group };
}

function emptyMetrics(): BehaviorSummaryMetrics {
  return {
    effectiveRecordCount: 0,
    positiveCount: 0,
    negativeCount: 0,
    positiveDelta: 0,
    negativeDelta: 0,
    netDelta: 0,
  };
}

function addDelta(metrics: BehaviorSummaryMetrics, delta: number): void {
  metrics.effectiveRecordCount += 1;
  metrics.netDelta += delta;
  if (delta > 0) {
    metrics.positiveCount += 1;
    metrics.positiveDelta += delta;
  } else if (delta < 0) {
    metrics.negativeCount += 1;
    metrics.negativeDelta += delta;
  }
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function joinLabels(dimensions: BehaviorSummaryDimension[]): string {
  return dimensions.map((dimension) => dimension.label).join('、');
}

export const behaviorSummaryService = new BehaviorSummaryService();
