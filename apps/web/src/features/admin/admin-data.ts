import type { ResourceProps } from '@refinedev/core';
import type {
  DisplayDevice as ApiDisplayDevice,
  ScoreRecord as ApiScoreRecord,
  ScoreRule as ApiScoreRule,
  Seat as ApiSeat,
  Student as ApiStudent,
} from '@/lib';

export type SeatCellType = 'seat' | 'aisle' | 'podium' | 'empty';

export type AdminRoute =
  | 'overview'
  | 'students'
  | 'students-committee'
  | 'seating'
  | 'schedule'
  | 'teachers'
  | 'score-rules'
  | 'score-records'
  | 'display-devices';

export type StudentStatus = 'ACTIVE' | 'INACTIVE';

export interface Student extends Omit<
  ApiStudent,
  'classId' | 'studentNo' | 'createdAt' | 'updatedAt'
> {
  name: string;
  studentNo: string;
  seat: string | null;
  updatedAt: string;
  createdAt: string;
}

export type TeacherStatus = 'ACTIVE' | 'PENDING' | 'DISABLED';

export interface Teacher {
  id: string;
  name: string;
  subject: string;
  status: TeacherStatus;
  invitationUrl: string | null;
  invitationExpiresAt: string | null;
  lastActiveAt: string | null;
}

export interface ScoreRule extends Omit<
  ApiScoreRule,
  'classId' | 'description' | 'createdBy' | 'createdAt' | 'updatedAt'
> {
  group: string;
  description: string;
  updatedAt: string;
}

export type ScoreRecordType = 'NORMAL' | 'REVERT';

export interface ScoreRecord extends Omit<
  ApiScoreRecord,
  'student' | 'operator' | 'subject' | 'rule' | 'createdAt'
> {
  studentId: string;
  studentName: string;
  operatorId: string;
  operatorName: string;
  subject: string;
  ruleName: string | null;
  delta: number;
  reason: string | null;
  recordType: ScoreRecordType;
  reverted: boolean;
  periodId: string | null;
  eventId: string | null;
  violation: boolean;
  occurredAt: string;
  createdAt: string;
}

export function formatScoreRecordSource(record: Pick<ScoreRecord, 'ruleName' | 'event'>): string {
  if (record.ruleName) return record.ruleName;
  if (record.event?.type === 'LATE' && record.event.minutesLate !== null) {
    return `迟到${record.event.minutesLate}分钟`;
  }
  return record.event ? '事件积分' : '自定义积分';
}

export interface Seat extends Omit<ApiSeat, 'student'> {
  studentId: string | null;
  cellType?: SeatCellType;
}

export interface SeatLayoutVersion {
  id: string;
  version: number;
  createdAt: string;
  createdBy: string;
  gridRows: number;
  gridCols: number;
  seats: Seat[];
  sourceVersionId: string | null;
}

export interface DisplayDevice extends Omit<
  ApiDisplayDevice,
  'status' | 'lastSeenAt' | 'createdAt' | 'revokedAt' | 'online'
> {
  status: 'ONLINE' | 'OFFLINE';
  lastSeenAt: string;
  boundAt: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  time: string;
  tone: 'blue' | 'green' | 'orange' | 'gray';
}

export type NotificationType = 'score' | 'seating' | 'teacher' | 'student' | 'device' | 'system';

export interface AdminNotification {
  id: string;
  title: string;
  description: string;
  time: string;
  type: NotificationType;
  read: boolean;
  targetHref?: string;
}

export interface AdminBindingSession {
  sessionId: string;
  code: string;
  deviceName: string;
  expiresAt: string;
  status: 'PENDING' | 'READY' | 'EXPIRED';
  deviceId?: string;
}

export const navItems: Array<{
  key: AdminRoute;
  label: string;
  href: string;
  description: string;
}> = [
  { key: 'overview', label: '班级概览', href: '/admin', description: '查看班级运行状态' },
  { key: 'students', label: '学生管理', href: '/admin/students', description: '维护学生与学号' },
  { key: 'seating', label: '座位管理', href: '/admin/seating', description: '编辑课堂座位布局' },
  { key: 'schedule', label: '课程表', href: '/admin/schedule', description: '编辑班级课程表' },
  {
    key: 'teachers',
    label: '任课教师',
    href: '/admin/teachers',
    description: '管理教师关系与邀请',
  },
  {
    key: 'score-rules',
    label: '积分规则',
    href: '/admin/score-rules',
    description: '配置快捷积分规则',
  },
  {
    key: 'score-records',
    label: '积分记录',
    href: '/admin/score-records',
    description: '查看与撤销积分记录',
  },
  {
    key: 'display-devices',
    label: '大屏设备',
    href: '/admin/display-devices',
    description: '绑定与管理课堂大屏',
  },
];

export const adminResources: ResourceProps[] = navItems.map((item) => ({
  name: item.key,
  list: item.href,
  meta: {
    label: item.label,
    route: item.href,
    description: item.description,
  },
}));

export const defaultRuleGroups = ['课堂表现', '团队协作', '日常纪律', '作业练习'];

export function cloneSeats(seats: Seat[]): Seat[] {
  return seats.map((seat) => ({ ...seat }));
}

export function formatSeat(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

export function formatDateTime(value: string): string {
  return value.replace(' ', ' · ');
}
