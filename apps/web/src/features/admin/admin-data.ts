import type { ResourceProps } from "@refinedev/core";
import type {
  ClassroomSummary as ApiClassroomSummary,
  DisplayDevice as ApiDisplayDevice,
  ScoreRecord as ApiScoreRecord,
  ScoreRule as ApiScoreRule,
  Seat as ApiSeat,
  Student as ApiStudent,
} from "@/lib";

export type SeatCellType = "seat" | "aisle" | "podium" | "empty";

export type AdminRoute =
  | "overview"
  | "students"
  | "seating"
  | "teachers"
  | "score-rules"
  | "score-records"
  | "display-devices";

export type StudentStatus = "ACTIVE" | "INACTIVE";

export interface Student extends Omit<ApiStudent, "classId" | "studentNo" | "createdAt" | "updatedAt"> {
  name: string;
  studentNo: string;
  seat: string | null;
  updatedAt: string;
  createdAt: string;
}

export type TeacherStatus = "ACTIVE" | "PENDING" | "DISABLED";

export interface Teacher {
  id: string;
  name: string;
  subject: string;
  status: TeacherStatus;
  invitationUrl: string | null;
  invitationExpiresAt: string | null;
  lastActiveAt: string | null;
}

export interface ScoreRule extends Omit<ApiScoreRule, "classId" | "description" | "createdBy" | "createdAt" | "updatedAt"> {
  group: string;
  description: string;
  updatedAt: string;
}

export type ScoreRecordType = "NORMAL" | "REVERT";

export interface ScoreRecord extends Omit<ApiScoreRecord, "student" | "operator" | "subject" | "rule" | "createdAt"> {
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
  createdAt: string;
}

export interface Seat extends Omit<ApiSeat, "student"> {
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

export interface DisplayDevice extends Omit<ApiDisplayDevice, "status" | "lastSeenAt" | "createdAt" | "revokedAt" | "online"> {
  status: "ONLINE" | "OFFLINE";
  lastSeenAt: string;
  boundAt: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  time: string;
  tone: "blue" | "green" | "orange" | "gray";
}

export type NotificationType = "score" | "seating" | "teacher" | "student" | "device" | "system";

export interface AdminNotification {
  id: string;
  title: string;
  description: string;
  time: string;
  type: NotificationType;
  read: boolean;
  targetHref?: string;
}

export const classroom: Pick<ApiClassroomSummary, "id" | "name" | "grade" | "gridRows" | "gridCols"> & {
  school: string;
  teacherName: string;
} = {
  id: "class-7-2",
  name: "高一（10）班",
  grade: "2026 学年 · 高一年级",
  school: "南昌市第二中学",
  teacherName: "林怡君",
  gridRows: 7,
  gridCols: 9,
};

export const navItems: Array<{
  key: AdminRoute;
  label: string;
  href: string;
  description: string;
}> = [
  { key: "overview", label: "班级概览", href: "/admin", description: "查看班级运行状态" },
  { key: "students", label: "学生管理", href: "/admin/students", description: "维护学生与学号" },
  { key: "seating", label: "座位管理", href: "/admin/seating", description: "编辑课堂座位布局" },
  { key: "teachers", label: "任课教师", href: "/admin/teachers", description: "管理教师关系与邀请" },
  { key: "score-rules", label: "积分规则", href: "/admin/score-rules", description: "配置快捷积分规则" },
  { key: "score-records", label: "积分记录", href: "/admin/score-records", description: "查看与撤销积分记录" },
  {
    key: "display-devices",
    label: "大屏设备",
    href: "/admin/display-devices",
    description: "绑定与管理课堂大屏",
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

export const initialStudents: Student[] = [
  {
    id: "stu-001",
    name: "王品涵",
    studentNo: "70201",
    status: "ACTIVE",
    seat: "A1",
    updatedAt: "2026-08-26 08:30",
    createdAt: "2026-02-15",
  },
  {
    id: "stu-002",
    name: "陳昱安",
    studentNo: "70202",
    status: "ACTIVE",
    seat: "A2",
    updatedAt: "2026-08-25 16:10",
    createdAt: "2026-02-15",
  },
  {
    id: "stu-003",
    name: "林承翰",
    studentNo: "70203",
    status: "ACTIVE",
    seat: "B1",
    updatedAt: "2026-08-24 12:45",
    createdAt: "2026-02-15",
  },
  {
    id: "stu-004",
    name: "張雅筑",
    studentNo: "70204",
    status: "ACTIVE",
    seat: "B2",
    updatedAt: "2026-08-26 07:55",
    createdAt: "2026-02-15",
  },
  {
    id: "stu-005",
    name: "李昀臻",
    studentNo: "70205",
    status: "ACTIVE",
    seat: null,
    updatedAt: "2026-08-22 14:20",
    createdAt: "2026-02-15",
  },
  {
    id: "stu-006",
    name: "吳柏毅",
    studentNo: "70206",
    status: "ACTIVE",
    seat: null,
    updatedAt: "2026-08-21 10:05",
    createdAt: "2026-02-15",
  },
  {
    id: "stu-007",
    name: "周語彤",
    studentNo: "70207",
    status: "ACTIVE",
    seat: null,
    updatedAt: "2026-08-20 09:40",
    createdAt: "2026-02-15",
  },
  {
    id: "stu-008",
    name: "黃柏鈞",
    studentNo: "70208",
    status: "ACTIVE",
    seat: null,
    updatedAt: "2026-08-18 11:30",
    createdAt: "2026-02-15",
  },
  {
    id: "stu-009",
    name: "許家瑜",
    studentNo: "70209",
    status: "ACTIVE",
    seat: "C1",
    updatedAt: "2026-08-17 15:10",
    createdAt: "2026-02-15",
  },
  {
    id: "stu-010",
    name: "郭子睿",
    studentNo: "70210",
    status: "INACTIVE",
    seat: null,
    updatedAt: "2026-08-12 13:00",
    createdAt: "2026-02-15",
  },
  {
    id: "stu-011",
    name: "蔡宜庭",
    studentNo: "70211",
    status: "ACTIVE",
    seat: null,
    updatedAt: "2026-08-11 08:50",
    createdAt: "2026-02-15",
  },
  {
    id: "stu-012",
    name: "劉冠廷",
    studentNo: "70212",
    status: "ACTIVE",
    seat: null,
    updatedAt: "2026-08-10 17:20",
    createdAt: "2026-02-15",
  },
];

export const initialTeachers: Teacher[] = [
  {
    id: "teacher-001",
    name: "王志明",
    subject: "數學",
    status: "ACTIVE",
    invitationUrl: null,
    invitationExpiresAt: null,
    lastActiveAt: "2026-08-26 09:12",
  },
  {
    id: "teacher-002",
    name: "李佳蓉",
    subject: "英語",
    status: "PENDING",
    invitationUrl: "https://classroom.example/invite/eng-702-8f21",
    invitationExpiresAt: "2026-08-30 23:59",
    lastActiveAt: null,
  },
  {
    id: "teacher-003",
    name: "張凱文",
    subject: "自然",
    status: "DISABLED",
    invitationUrl: null,
    invitationExpiresAt: null,
    lastActiveAt: "2026-07-18 11:03",
  },
];

export const defaultRuleGroups = ["课堂表现", "团队协作", "日常纪律", "作业练习"];

export const initialRules: ScoreRule[] = [
  {
    id: "rule-001",
    name: "主動回答問題",
    group: "课堂表现",
    delta: 2,
    description: "能完整說明思考過程並協助同學理解。",
    enabled: true,
    updatedAt: "2026-08-20 09:15",
  },
  {
    id: "rule-002",
    name: "小組合作",
    group: "团队协作",
    delta: 3,
    description: "在小組任務中有清楚分工並完成任務。",
    enabled: true,
    updatedAt: "2026-08-19 13:20",
  },
  {
    id: "rule-003",
    name: "課堂準備不足",
    group: "日常纪律",
    delta: -2,
    description: "忘記攜帶課本或未完成指定課前準備。",
    enabled: false,
    updatedAt: "2026-08-16 16:40",
  },
  {
    id: "rule-004",
    name: "作业书写工整",
    group: "作业练习",
    delta: 1,
    description: "书写规范工整，订正及时。",
    enabled: true,
    updatedAt: "2026-08-15 14:10",
  },
];

export const initialRecords: ScoreRecord[] = [
  {
    id: "score-001",
    studentId: "stu-001",
    studentName: "王品涵",
    operatorId: "teacher-001",
    operatorName: "王志明",
    subject: "數學",
    ruleName: "主動回答問題",
    delta: 2,
    reason: "解題步驟完整，主動補充另一種解法。",
    recordType: "NORMAL",
    reverted: false,
    createdAt: "2026-08-26 10:09",
  },
  {
    id: "score-002",
    studentId: "stu-004",
    studentName: "張雅筑",
    operatorId: "teacher-002",
    operatorName: "李佳蓉",
    subject: "英語",
    ruleName: "小組合作",
    delta: 3,
    reason: "帶領小組完成口說練習並協助同學。",
    recordType: "NORMAL",
    reverted: true,
    createdAt: "2026-08-26 09:46",
  },
  {
    id: "score-003",
    studentId: "stu-003",
    studentName: "林承翰",
    operatorId: "teacher-001",
    operatorName: "王志明",
    subject: "數學",
    ruleName: null,
    delta: 5,
    reason: "主動整理黑板與共用學習材料，讓課堂順利進行。",
    recordType: "NORMAL",
    reverted: false,
    createdAt: "2026-08-25 14:21",
  },
  {
    id: "score-004",
    studentId: "stu-002",
    studentName: "陳昱安",
    operatorId: "teacher-002",
    operatorName: "李佳蓉",
    subject: "英語",
    ruleName: "課堂準備不足",
    delta: -2,
    reason: "第二次忘記帶英文課本，已提醒下次準備。",
    recordType: "NORMAL",
    reverted: false,
    createdAt: "2026-08-25 10:32",
  },
  {
    id: "score-005",
    studentId: "stu-004",
    studentName: "張雅筑",
    operatorId: "teacher-002",
    operatorName: "李佳蓉",
    subject: "英語",
    ruleName: "小組合作",
    delta: -3,
    reason: "撤銷先前重複登錄的積分流水。",
    recordType: "REVERT",
    reverted: false,
    createdAt: "2026-08-26 09:55",
  },
];

export const initialSeats: Seat[] = [
  { id: "seat-1-0", row: 1, col: 0, studentId: "stu-001" },
  { id: "seat-1-1", row: 1, col: 1, studentId: "stu-002" },
  { id: "seat-1-2", row: 1, col: 2, studentId: "stu-003" },
  { id: "seat-1-3", row: 1, col: 3, studentId: "stu-004" },
  { id: "seat-1-5", row: 1, col: 5, studentId: "stu-005" },
  { id: "seat-1-7", row: 1, col: 7, studentId: "stu-006" },
  { id: "seat-1-8", row: 1, col: 8, studentId: "stu-007" },
  { id: "seat-2-0", row: 2, col: 0, studentId: "stu-008" },
  { id: "seat-2-1", row: 2, col: 1, studentId: "stu-009" },
  { id: "seat-2-2", row: 2, col: 2, studentId: "stu-010" },
  { id: "seat-2-3", row: 2, col: 3, studentId: "stu-011" },
  { id: "seat-2-5", row: 2, col: 5, studentId: null },
  { id: "seat-2-7", row: 2, col: 7, studentId: null },
  { id: "seat-2-8", row: 2, col: 8, studentId: null },
  { id: "seat-3-0", row: 3, col: 0, studentId: null },
  { id: "seat-3-1", row: 3, col: 1, studentId: null },
  { id: "seat-3-2", row: 3, col: 2, studentId: null },
  { id: "seat-3-3", row: 3, col: 3, studentId: null },
  { id: "seat-3-5", row: 3, col: 5, studentId: null },
  { id: "seat-3-7", row: 3, col: 7, studentId: null },
  { id: "seat-3-8", row: 3, col: 8, studentId: null },
  { id: "cell-0-4", row: 0, col: 4, studentId: null, cellType: "podium" },
  ...[1, 2, 3, 4, 5, 6].flatMap((row) => [4, 6].map((col) => ({
    id: `cell-${row}-${col}`,
    row,
    col,
    studentId: null,
    cellType: "aisle" as const,
  }))),
];

export const initialVersions: SeatLayoutVersion[] = [
  {
    id: "layout-v5",
    version: 5,
    createdAt: "2026-08-26 08:24",
    createdBy: "林怡君",
    gridRows: classroom.gridRows,
    gridCols: classroom.gridCols,
    seats: initialSeats,
    sourceVersionId: null,
  },
  {
    id: "layout-v4",
    version: 4,
    createdAt: "2026-08-25 16:52",
    createdBy: "林怡君",
    gridRows: classroom.gridRows,
    gridCols: classroom.gridCols,
    seats: initialSeats.map((seat) =>
      seat.id === "seat-2-3" ? { ...seat, studentId: null } : seat,
    ),
    sourceVersionId: null,
  },
  {
    id: "layout-v3",
    version: 3,
    createdAt: "2026-08-22 10:11",
    createdBy: "林怡君",
    gridRows: 3,
    gridCols: classroom.gridCols,
    seats: initialSeats.filter((seat) => seat.row <= 2),
    sourceVersionId: null,
  },
];

export const initialDevices: DisplayDevice[] = [
  {
    id: "display-001",
    name: "教室前方大屏",
    status: "ONLINE",
    lastSeenAt: "2026-08-26 10:12:08",
    boundAt: "2026-08-18 08:35:00",
  },
];

export const initialActivities: ActivityItem[] = [
  {
    id: "activity-001",
    title: "王志明老師新增積分",
    description: "王品涵 · 主動回答問題 · +2",
    time: "10 分鐘前",
    tone: "blue",
  },
  {
    id: "activity-002",
    title: "座位布局已更新",
    description: "版本 5 · 林怡君",
    time: "今天 08:24",
    tone: "green",
  },
  {
    id: "activity-003",
    title: "李佳蓉老師接受邀請",
    description: "英語 · 已加入任課教師",
    time: "昨天 16:10",
    tone: "orange",
  },
  {
    id: "activity-004",
    title: "許家瑜完成學生資料更新",
    description: "學生編號 70209 · 資料已同步",
    time: "昨天 15:10",
    tone: "gray",
  },
];

export const initialNotifications: AdminNotification[] = [
  {
    id: "notif-001",
    title: "王品涵 +2 分",
    description: "王志明 · 主动回答问题",
    time: "10 分钟前",
    type: "score",
    read: false,
    targetHref: "/admin/score-records",
  },
  {
    id: "notif-002",
    title: "座位布局已更新",
    description: "版本 5",
    time: "今天 08:24",
    type: "seating",
    read: false,
    targetHref: "/admin/seating",
  },
  {
    id: "notif-003",
    title: "李佳蓉已加入班级",
    description: "英语 · 任课教师",
    time: "昨天 16:10",
    type: "teacher",
    read: false,
    targetHref: "/admin/teachers",
  },
  {
    id: "notif-004",
    title: "许家瑜资料更新",
    description: "学号 70209",
    time: "昨天 15:10",
    type: "student",
    read: true,
    targetHref: "/admin/students",
  },
  {
    id: "notif-005",
    title: "前方大屏已连接",
    description: "设备在线",
    time: "3 天前",
    type: "device",
    read: true,
    targetHref: "/admin/display-devices",
  },
];

export function cloneSeats(seats: Seat[]): Seat[] {
  return seats.map((seat) => ({ ...seat }));
}

export function formatSeat(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

export function formatDateTime(value: string): string {
  return value.replace(" ", " · ");
}
