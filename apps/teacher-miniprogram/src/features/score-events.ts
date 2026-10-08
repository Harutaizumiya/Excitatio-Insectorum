import type { CreateScoreEventInput, ScoreEventType } from '../lib/api.ts';

export const SCORE_EVENT_OPTIONS: Array<{ value: ScoreEventType; label: string }> = [
  { value: 'LATE', label: '迟到' },
  { value: 'SCHOOL_UNIFORM', label: '校服' },
  { value: 'EVENING_SELF_STUDY_CALLOUT', label: '晚自习点名' },
  { value: 'NOISIEST_CLASS_TOP3', label: '班级噪音前三' },
  { value: 'HOMEWORK_MISSING', label: '作业未交' },
  { value: 'HOMEWORK_PRAISE', label: '作业表扬' },
  { value: 'EXAM_GRADE_TOP10', label: '年级考试前十' },
  { value: 'SUBJECT_TOP3', label: '单科前三' },
  { value: 'BREAKTHROUGH', label: '突破性成绩' },
  { value: 'PROGRESS', label: '进步名次' },
  { value: 'DUTY_HYGIENE', label: '卫生事件' },
  { value: 'DORM_HYGIENE', label: '寝室卫生' },
  { value: 'COMMITTEE_TASK_COMPLETED', label: '班委任务完成' },
  { value: 'BLACKBOARD', label: '黑板报' },
  { value: 'INDIVIDUAL_ACTIVITY', label: '个人活动' },
  { value: 'GROUP_ACTIVITY', label: '团体活动' },
  { value: 'SPORTS_FINAL_TOP8', label: '运动会决赛' },
  { value: 'ACTIVITY_NEGATIVE', label: '活动违规' },
  { value: 'MANUAL', label: '自定义事件' },
];

export const MANUAL_SCORE_EVENT_TYPES = new Set<ScoreEventType>([
  'HOMEWORK_MISSING',
  'HOMEWORK_PRAISE',
  'BREAKTHROUGH',
  'PROGRESS',
  'DUTY_HYGIENE',
  'DORM_HYGIENE',
  'MANUAL',
]);

export const RANK_SCORE_EVENT_TYPES = new Set<ScoreEventType>([
  'NOISIEST_CLASS_TOP3',
  'EXAM_GRADE_TOP10',
  'SUBJECT_TOP3',
  'BLACKBOARD',
  'INDIVIDUAL_ACTIVITY',
  'SPORTS_FINAL_TOP8',
  'GROUP_ACTIVITY',
]);

export interface ScoreEventDraft {
  type: ScoreEventType;
  studentIds: string[];
  minutesLate: string;
  rank: string;
  manualDelta: string;
  isOrganizer: boolean;
  specialContribution: boolean;
  reason: string;
}

export function scoreEventMaxRank(type: ScoreEventType): number {
  if (type === 'EXAM_GRADE_TOP10') return 10;
  if (type === 'SPORTS_FINAL_TOP8') return 8;
  return 3;
}

export function validateScoreEventDraft(draft: ScoreEventDraft): string | null {
  if (draft.studentIds.length === 0) return '请选择学生';
  if (
    draft.type === 'LATE' &&
    (!Number.isInteger(Number(draft.minutesLate)) || Number(draft.minutesLate) < 1)
  ) {
    return '迟到分钟数必须为正整数';
  }
  if (RANK_SCORE_EVENT_TYPES.has(draft.type)) {
    const rank = Number(draft.rank);
    const max = scoreEventMaxRank(draft.type);
    if (!Number.isInteger(rank) || rank < 1 || rank > max) return `名次须为 1-${max} 的整数`;
  }
  if (MANUAL_SCORE_EVENT_TYPES.has(draft.type)) {
    const delta = Number(draft.manualDelta);
    if (!Number.isInteger(delta) || delta === 0) return '最终分值须为非 0 整数';
    if (!draft.reason.trim()) return '请填写原因';
  }
  if (
    draft.type === 'GROUP_ACTIVITY' &&
    !draft.isOrganizer &&
    !draft.specialContribution &&
    Number(draft.rank) < 1
  ) {
    return '请选择名次或角色';
  }
  if (draft.reason.length > 200) return '原因最多 200 字';
  return null;
}

export function toCreateScoreEventInput(
  draft: ScoreEventDraft,
  businessKey: string,
): CreateScoreEventInput {
  const error = validateScoreEventDraft(draft);
  if (error) throw new Error(error);
  const input: CreateScoreEventInput = {
    type: draft.type,
    studentIds: [...new Set(draft.studentIds)],
    businessKey,
  };
  if (draft.type === 'LATE') input.minutesLate = Number(draft.minutesLate);
  if (RANK_SCORE_EVENT_TYPES.has(draft.type)) input.rank = Number(draft.rank);
  if (MANUAL_SCORE_EVENT_TYPES.has(draft.type)) input.manualDelta = Number(draft.manualDelta);
  if (draft.type === 'GROUP_ACTIVITY') {
    input.isOrganizer = draft.isOrganizer;
    input.specialContribution = draft.specialContribution;
  }
  if (draft.reason.trim()) input.reason = draft.reason.trim();
  return input;
}

export function createBusinessKey(
  classId: string,
  timestamp = Date.now(),
  entropy = Math.random(),
): string {
  return `teacher-score:${classId}:${timestamp}:${Math.floor(entropy * 0x1_0000_0000).toString(36)}`;
}
