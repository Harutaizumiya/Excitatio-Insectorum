export type IsoDateTime = string;

export interface DataEnvelope<T> {
  data: T;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface PaginatedEnvelope<T> extends DataEnvelope<T[]> {
  meta: PaginationMeta;
}

export interface ApiFailure {
  code: string;
  message: string;
  requestId: string;
}

export type TeacherRole = 'HEAD_TEACHER' | 'SUBJECT_TEACHER';
export type RelationStatus = 'ACTIVE' | 'REVOKED';
export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type StudentStatus = 'ACTIVE' | 'INACTIVE';
export type StudentGender = 'MALE' | 'FEMALE' | 'UNKNOWN';
export type ScoreRecordType = 'NORMAL' | 'REVERT';
export type DeviceStatus = 'ACTIVE' | 'REVOKED';

export interface ClassroomSummary {
  id: string;
  name: string;
  grade: string;
  schoolYear: string;
  gridRows: number;
  gridCols: number;
  role: TeacherRole;
  subject: string | null;
}

export interface Classroom extends ClassroomSummary {
  activeScheduleTemplateId: string | null;
  currentLayoutVersionId: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface UpdateClassroomInput {
  name?: string;
  grade?: string;
  schoolYear?: string;
  gridRows?: number;
  gridCols?: number;
}

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface SchedulePeriod {
  periodNo: number;
  startTime: string;
  endTime: string;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  periods: SchedulePeriod[];
}

export interface ScheduleEntry {
  weekday: Weekday;
  periodNo: number;
  courseName: string;
  classTeacherId: string | null;
  teacher: NamedEntity | null;
}

export interface ClassSchedule {
  activeTemplateId: string | null;
  templates: ScheduleTemplate[];
  entries: ScheduleEntry[];
}

export interface ScheduleTemplateDraft {
  clientKey: string;
  id?: string;
  name: string;
  periods: SchedulePeriod[];
}

export interface SaveClassScheduleInput {
  activeTemplateKey: string;
  templates: ScheduleTemplateDraft[];
  entries: Array<{
    weekday: Weekday;
    periodNo: number;
    courseName: string;
    classTeacherId?: string | null;
  }>;
}

export interface Student {
  id: string;
  classId: string;
  name: string;
  studentNo: string | null;
  gender?: StudentGender;
  status: StudentStatus;
  deletedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface DormitoryMember {
  id: string;
  name: string;
  studentNo: string | null;
}

export interface Dormitory {
  id: string;
  classId: string;
  name: string;
  students: DormitoryMember[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateDormitoryScoreInput {
  studentIds: string[];
  delta: number;
  reason: string;
  businessKey: string;
}

export interface StudentListQuery {
  status?: StudentStatus;
  includeDeleted?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateStudentInput {
  name: string;
  studentNo?: string;
}

export interface UpdateStudentInput {
  name?: string;
  studentNo?: string | null;
}

export interface TeacherIdentity {
  id: string;
  name: string;
  status: UserStatus;
}

export interface ClassTeacher {
  id: string;
  classId: string;
  teacherId: string;
  role: TeacherRole;
  subject: string | null;
  status: RelationStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  teacher: TeacherIdentity;
  invitations?: Array<{
    status: 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED';
    expiresAt: IsoDateTime;
    usedAt: IsoDateTime | null;
    createdAt: IsoDateTime;
  }>;
}

export interface CreateTeacherInput {
  name: string;
  subject: string;
}

export interface UpdateTeacherInput {
  name?: string;
  subject?: string;
}

export interface CreateTeacherResult {
  classTeacherId: string;
  teacherId: string;
}

export interface TeacherInvitation {
  inviteUrl: string;
  expiresAt: IsoDateTime;
}

export interface NamedEntity {
  id: string;
  name: string;
}

export interface Seat {
  id: string;
  row: number;
  col: number;
  cellType?: SeatCellType;
  student: NamedEntity | null;
}

export type SeatCellType = 'seat' | 'aisle' | 'podium' | 'empty';

export interface SeatLayout {
  versionId: string | null;
  version: number | null;
  rows: number;
  cols: number;
  seats: Seat[];
}

export interface SeatLayoutVersion extends Omit<SeatLayout, 'versionId' | 'version'> {
  versionId: string;
  version: number;
  classId: string;
  sourceVersionId: string | null;
  createdBy: string;
  createdAt: IsoDateTime;
}

export interface SeatLayoutVersionSummary {
  versionId: string;
  version: number;
  sourceVersionId: string | null;
  createdBy: string;
  createdAt: IsoDateTime;
}

export interface SeatDraft {
  row: number;
  col: number;
  cellType?: SeatCellType;
  studentId: string | null;
}

export interface SaveSeatLayoutInput {
  seats: SeatDraft[];
  gridRows?: number;
  gridCols?: number;
  baseVersion?: number;
}

export interface SeatLayoutMutation {
  versionId: string;
  version: number;
  sourceVersionId?: string;
}

export interface ScoreRule {
  id: string;
  classId: string;
  name: string;
  group?: string;
  systemPolicyKey?: string | null;
  delta: number;
  description: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateScoreRuleInput {
  name: string;
  delta: number;
  group?: string;
  description?: string | null;
  systemPolicyKey?: string | null;
}

export interface UpdateScoreRuleInput {
  name?: string;
  delta?: number;
  group?: string;
  description?: string | null;
  enabled?: boolean;
  systemPolicyKey?: string | null;
}

export type ScoreEventType =
  | 'LATE'
  | 'SCHOOL_UNIFORM'
  | 'EVENING_SELF_STUDY_CALLOUT'
  | 'NO_VIOLATION_REWARD'
  | 'NOISIEST_CLASS_TOP3'
  | 'HOMEWORK_MISSING'
  | 'HOMEWORK_PRAISE'
  | 'EXAM_GRADE_TOP10'
  | 'SUBJECT_TOP3'
  | 'BREAKTHROUGH'
  | 'PROGRESS'
  | 'DUTY_HYGIENE'
  | 'DORM_HYGIENE'
  | 'COMMITTEE_TASK_COMPLETED'
  | 'COMMITTEE_REWARD'
  | 'BLACKBOARD'
  | 'INDIVIDUAL_ACTIVITY'
  | 'GROUP_ACTIVITY'
  | 'SPORTS_FINAL_TOP8'
  | 'ACTIVITY_NEGATIVE'
  | 'MANUAL';

export interface CreateScoreEventInput {
  type: ScoreEventType;
  studentIds: string[];
  occurredAt?: IsoDateTime;
  minutesLate?: number;
  rank?: number;
  manualDelta?: number;
  isOrganizer?: boolean;
  specialContribution?: boolean;
  subject?: string;
  reason?: string;
  businessKey?: string;
}

export interface ScoreEventResult {
  id: string;
  type: ScoreEventType;
  periodId: string;
  occurredAt: IsoDateTime;
  studentIds: string[];
  records: Array<{ studentId: string; delta: number }>;
  sourceDormitory?: { id: string; name: string } | null;
}

export interface ScoreRecordEvent {
  type: ScoreEventType;
  minutesLate: number | null;
}

export interface ScorePeriod {
  id: string;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  initialScore: number;
  status: 'OPEN' | 'SETTLED';
  settledAt: IsoDateTime | null;
}

export interface PeriodScoreStudent {
  studentId: string;
  name: string;
  score: number;
  rank: number;
}

export interface ScorePeriodSummary {
  period: ScorePeriod | null;
  periods: ScorePeriod[];
  range: { startAt: IsoDateTime; endAt: IsoDateTime };
  students: PeriodScoreStudent[];
  top3: PeriodScoreStudent[];
  recommendedSeatOrder: PeriodScoreStudent[];
}

export interface CommitteeAssignment {
  id: string;
  studentId: string;
  studentName: string;
  role: string;
  subject: string | null;
  termStartAt: IsoDateTime;
  termEndAt: IsoDateTime | null;
  trialEndsAt: IsoDateTime | null;
  status: 'ACTIVE' | 'REVOKED';
}

export interface CommitteeAssignmentInput {
  studentId: string;
  role: string;
  subject?: string | null;
  termStartAt: IsoDateTime;
  termEndAt?: IsoDateTime | null;
  trialEndsAt?: IsoDateTime | null;
}

export interface UpdateCommitteeInput {
  assignments: CommitteeAssignmentInput[];
}

export interface ScoreRecord {
  id: string;
  student: NamedEntity;
  operator: NamedEntity;
  subject: string | null;
  rule: NamedEntity | null;
  delta: number;
  reason: string | null;
  recordType: ScoreRecordType;
  reverted: boolean;
  periodId: string | null;
  eventId: string | null;
  event: ScoreRecordEvent | null;
  violation: boolean;
  occurredAt: IsoDateTime;
  createdAt: IsoDateTime;
}

export interface ScoreRecordListQuery {
  studentId?: string;
  operatorId?: string;
  from?: IsoDateTime;
  to?: IsoDateTime;
  page?: number;
  pageSize?: number;
}

export interface CreateRuleScoreInput {
  studentId: string;
  ruleId: string;
  operatorId?: string;
}

export interface CreateCustomScoreInput {
  studentId: string;
  delta: number;
  reason: string;
  operatorId?: string;
}

export interface RankingPeriod {
  type: 'WEEK';
  startAt: IsoDateTime;
  endAt: IsoDateTime;
}

export interface TopRankingItem {
  studentId: string;
  name: string;
  rank: number;
}

export interface ProgressRankingItem {
  studentId: string;
  name: string;
  previousRank: number;
  currentRank: number;
  change: number;
}

export interface WeeklyRanking {
  period: RankingPeriod;
  top3: TopRankingItem[];
  progress: ProgressRankingItem[];
  strategy: string;
}

export interface RandomPickInput {
  excludeStudentIds?: string[];
}

export interface RandomPickResult {
  student: NamedEntity;
}

export interface DisplayDevice {
  id: string;
  name: string;
  status: DeviceStatus;
  lastSeenAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  revokedAt: IsoDateTime | null;
  online: boolean;
}

export interface CreateBindingCodeResult {
  code: string;
  expiresAt: IsoDateTime;
  bindingSessionId: string;
  nonce: string;
}

export interface BindDisplayInput {
  code: string;
  name: string;
}

export interface BindDisplayResult {
  deviceId: string;
}

export interface PollBindingSessionInput {
  nonce: string;
}

export type PollBindingSessionResult =
  { status: 'PENDING' } | { status: 'READY'; deviceId: string; credential: string };

export interface DeviceTokenInput {
  deviceId: string;
  credential: string;
}

export interface DeviceTokenResult {
  accessToken: string;
  expiresIn: number;
}

export interface DisplayBootstrap {
  classroom: Pick<ClassroomSummary, 'id' | 'name' | 'gridRows' | 'gridCols'>;
  layout: {
    version: number | null;
    seats: Array<{
      row: number;
      col: number;
      cellType?: SeatCellType;
      student: (NamedEntity & { score: number }) | null;
    }>;
  };
  ranking: {
    top3: Array<TopRankingItem & { score: number }>;
    progress: Array<Pick<ProgressRankingItem, 'studentId' | 'name' | 'change'>>;
  };
  schedule: {
    periods: SchedulePeriod[];
    entries: Array<{
      weekday: Weekday;
      periodNo: number;
      courseName: string;
    }>;
  };
}

export interface LoginInput {
  account: string;
  password: string;
}

export interface RefreshInput {
  refreshToken: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends TokenPair {
  user: NamedEntity;
}

export interface LogoutResult {
  loggedOut: true;
}

export interface ConsumeInvitationInput {
  deviceName: string;
}

export interface InvitationPreview {
  classroom: Pick<ClassroomSummary, 'id' | 'name'>;
  headTeacher: NamedEntity;
}

export interface InvitationConsumeResult extends TokenPair {
  classroom: Pick<ClassroomSummary, 'id' | 'name'>;
  teacher: {
    id: string;
    name: string;
    subject: string | null;
  };
}

export interface CreateClassroomBindingCodeResult {
  code: string;
  expiresAt: IsoDateTime;
  sessionId: string;
}

export interface ClassroomBindingSessionStatus {
  status: 'PENDING' | 'READY' | 'EXPIRED';
  deviceId?: string;
}

export interface BindDisplayByCodeResult {
  deviceId: string;
  credential: string;
  classroom: Pick<ClassroomSummary, 'id' | 'name'>;
}

export interface ImportedStudentInput {
  name: string;
  studentNo: string | null;
  gender: StudentGender;
}

export interface StudentImportResult {
  created: number;
  skipped: number;
  duplicates: Array<{ name: string; studentNo: string | null; reason: string }>;
  errors: Array<{ name: string; studentNo: string | null; reason: string }>;
}

export type UsageClientType = 'DISPLAY' | 'ADMIN_WEB' | 'TEACHER_MOBILE' | 'OTHER';
export type UsageEventResult = 'SUCCESS' | 'FAILURE';

export type TelemetryPropertyKey =
  | 'totalCount'
  | 'successCount'
  | 'failureCount'
  | 'operationMode'
  | 'reconnectCount'
  | 'durationMs'
  | 'errorCode'
  | 'feature'
  | 'itemCount';

export type TelemetryPropertyValue = string | number | boolean;

export type UsageEventProperties = Partial<Record<TelemetryPropertyKey, TelemetryPropertyValue>>;

export interface UsageEventInput {
  eventName: string;
  clientType: UsageClientType;
  classId?: string;
  result?: UsageEventResult;
  module?: string;
  page?: string;
  appVersion?: string;
  browser?: string;
  traceId?: string;
  errorCode?: string;
  properties?: UsageEventProperties;
  occurredAt?: IsoDateTime;
}

export interface UsageEventResponse {
  id: string;
  traceId: string;
}

export interface ReportUsageEventOptions {
  auth?: 'user' | 'display';
}

export type FeedbackType = 'BUG' | 'DIFFICULTY' | 'DATA_ISSUE' | 'FEATURE_REQUEST' | 'OTHER';
export type FeedbackStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface CreateFeedbackInput {
  type: FeedbackType;
  description: string;
  screenshotUrl?: string;
  clientType: UsageClientType;
  module?: string;
  page?: string;
  appVersion?: string;
  browser?: string;
  traceId?: string;
}

export interface FeedbackListQuery {
  status?: FeedbackStatus;
  type?: FeedbackType;
  page?: number;
  pageSize?: number;
}

export interface FeedbackListItem {
  id: string;
  code: string;
  type: FeedbackType;
  status: FeedbackStatus;
  clientType: UsageClientType;
  appVersion: string | null;
  traceId: string;
  createdAt: IsoDateTime;
  classroom: Pick<ClassroomSummary, 'id' | 'name'>;
}

export interface FeedbackDetail extends FeedbackListItem {
  description: string;
  screenshotUrl: string | null;
  classId: string;
  submittedById: string;
  module: string | null;
  page: string | null;
  browser: string | null;
  processingNote: string | null;
  processedById: string | null;
  processedAt: IsoDateTime | null;
  updatedAt: IsoDateTime;
  submittedBy: NamedEntity;
  processedBy: NamedEntity | null;
}

export interface FeedbackCreateResult {
  id: string;
  code: string;
  status: FeedbackStatus;
  traceId: string;
  createdAt: IsoDateTime;
}

export type CreateFeedbackResult = FeedbackCreateResult;
export type FeedbackListResult = PaginatedEnvelope<FeedbackListItem>;

export interface UpdateFeedbackInput {
  status?: FeedbackStatus;
  processingNote?: string | null;
}

export interface UsageAnalyticsQuery {
  from?: IsoDateTime;
  to?: IsoDateTime;
}

export interface UsageAnalyticsDailyTrend {
  date: string;
  activeDevices: number;
  onlineMinutes: number;
}

export interface UsageAnalyticsDisplaySummary {
  configured: number;
  currentlyOnline: number;
  activeDevices: number;
  averageOnlineMinutes: number;
  realtimeConnectionErrors: number;
  dailyTrend: UsageAnalyticsDailyTrend[];
}

export interface UsageAnalyticsFeatureUsage {
  feature: string;
  usageCount: number;
  activeTeachers: number;
  activeClassrooms: number;
}

export interface UsageAnalyticsFeedbackSummary {
  total: number;
  new: number;
  pending: number;
  resolved: number;
  closed: number;
}

export interface UsageAnalyticsVersionUsage {
  version: string;
  activeClients: number;
}

export interface UsageAnalyticsSummary {
  range: { from: IsoDateTime; to: IsoDateTime };
  activeClassrooms: number;
  activeTeachers: number;
  eventCount: number;
  errorCount: number;
  displays: UsageAnalyticsDisplaySummary;
  featureUsage: UsageAnalyticsFeatureUsage[];
  feedback: UsageAnalyticsFeedbackSummary;
  versions: UsageAnalyticsVersionUsage[];
}
