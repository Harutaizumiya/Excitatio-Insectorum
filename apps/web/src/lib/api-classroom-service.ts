import { ClassroomServiceError, type ClassroomService } from './classroom-service';
import type {
  BindDisplayByCodeResult,
  BindDisplayInput,
  BindDisplayResult,
  Classroom,
  ClassSchedule,
  ClassroomBindingSessionStatus,
  ClassroomSummary,
  ClassTeacher,
  ConsumeInvitationInput,
  CreateFeedbackInput,
  CreateBindingCodeResult,
  CreateClassroomBindingCodeResult,
  CreateCustomScoreInput,
  CreateScoreEventInput,
  CreateRuleScoreInput,
  CreateScoreRuleInput,
  CreateStudentInput,
  CreateTeacherInput,
  CreateTeacherResult,
  DeviceTokenInput,
  DeviceTokenResult,
  DisplayBootstrap,
  DisplayDevice,
  FeedbackCreateResult,
  FeedbackDetail,
  FeedbackListItem,
  FeedbackListQuery,
  ImportedStudentInput,
  InvitationPreview,
  InvitationConsumeResult,
  LoginInput,
  LoginResult,
  LogoutResult,
  PaginatedEnvelope,
  PollBindingSessionInput,
  PollBindingSessionResult,
  RandomPickInput,
  RandomPickResult,
  ReportUsageEventOptions,
  RefreshInput,
  SaveSeatLayoutInput,
  SaveClassScheduleInput,
  ScoreRecord,
  ScoreEventResult,
  ScorePeriodSummary,
  CommitteeAssignment,
  UpdateCommitteeInput,
  ScoreRecordListQuery,
  ScoreRule,
  SeatLayout,
  SeatLayoutMutation,
  SeatLayoutVersion,
  SeatLayoutVersionSummary,
  Student,
  StudentImportResult,
  StudentListQuery,
  TeacherInvitation,
  TokenPair,
  UpdateClassroomInput,
  UpdateFeedbackInput,
  UpdateScoreRuleInput,
  UpdateStudentInput,
  UpdateTeacherInput,
  UsageAnalyticsQuery,
  UsageAnalyticsSummary,
  UsageEventInput,
  UsageEventResponse,
  WeeklyRanking,
  IsoDateTime,
} from './domain';
import {
  clearUserSession,
  getDisplaySession,
  getUserSession,
  setActiveClassId,
  setDisplaySession,
  setUserSession,
} from './session';
import { reportBackendUnavailable } from './api-error';
import { getApiOrigin } from './utils';
import {
  createTraceId,
  reportUsageEventBestEffort,
  sanitizeUsageEventProperties,
} from './usage-telemetry';

const API_ORIGIN = getApiOrigin();

interface RequestOptions {
  auth?: 'user' | 'display' | 'none';
  retry?: boolean;
  requestId?: string;
  suppressBackendUnavailable?: boolean;
}

interface ApiErrorPayload {
  code?: unknown;
  message?: unknown;
  requestId?: unknown;
}

function isEnvelope(value: unknown): value is { data: unknown } {
  return typeof value === 'object' && value !== null && 'data' in value;
}

function isPaginatedPayload(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'meta' in value;
}

function errorPayload(value: unknown, status: number): ClassroomServiceError {
  const payload = (typeof value === 'object' && value !== null ? value : {}) as ApiErrorPayload;
  const code = typeof payload.code === 'string' ? payload.code : 'REQUEST_FAILED';
  const message = typeof payload.message === 'string' ? payload.message : '请求失败，请稍后重试';
  return new ClassroomServiceError(code, message, status);
}

function queryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      search.set(key, String(value));
  }
  const value = search.toString();
  return value ? `?${value}` : '';
}

function jsonBody(body: unknown): BodyInit {
  return JSON.stringify(body);
}

interface RequestUsageDescriptor {
  classId: string;
  eventName: string;
  module: string;
}

function requestUsageDescriptor(path: string, method: string): RequestUsageDescriptor | null {
  const pathname = path.split('?', 1)[0] ?? path;
  const match = /^\/classes\/([^/]+)(?:\/(.*))?$/.exec(pathname);
  if (!match) return null;

  const classId = decodeURIComponent(match[1] ?? '');
  const resource = match[2] ?? '';
  const operation = method.toUpperCase();
  const descriptor = (eventName: string, module: string): RequestUsageDescriptor => ({
    classId,
    eventName,
    module,
  });

  if (!resource && operation === 'PATCH') return descriptor('classroom.settings_updated', 'classroom');
  if (resource === 'students/import' && operation === 'POST') {
    return descriptor('students.imported', 'students');
  }
  if (resource === 'students' && operation === 'POST') return descriptor('students.created', 'students');
  if (/^students\/[^/]+$/.test(resource) && operation === 'PATCH') {
    return descriptor('students.updated', 'students');
  }
  if (/^students\/[^/]+\/(deactivate|restore|delete)$/.test(resource) && operation === 'POST') {
    return descriptor(`students.${resource.split('/').at(-1)}d`, 'students');
  }
  if (resource === 'teachers' && operation === 'POST') return descriptor('teachers.created', 'teachers');
  if (/^teachers\/[^/]+\/invitations$/.test(resource) && operation === 'POST') {
    return descriptor('teachers.invitation_created', 'teachers');
  }
  if (/^teachers\/[^/]+$/.test(resource) && ['PATCH', 'DELETE'].includes(operation)) {
    return descriptor(operation === 'DELETE' ? 'teachers.deleted' : 'teachers.updated', 'teachers');
  }
  if (/^teachers\/[^/]+\/(revoke|restore)$/.test(resource) && operation === 'POST') {
    return descriptor(`teachers.${resource.split('/').at(-1)}d`, 'teachers');
  }
  if (resource === 'score-rules' && operation === 'POST') {
    return descriptor('score_rules.created', 'score_rules');
  }
  if (/^score-rules\/[^/]+$/.test(resource) && operation === 'PATCH') {
    return descriptor('score_rules.updated', 'score_rules');
  }
  if (/^score-rules\/[^/]+\/disable$/.test(resource) && operation === 'POST') {
    return descriptor('score_rules.disabled', 'score_rules');
  }
  if (/^(scores\/(rule|custom)|score-events)$/.test(resource) && operation === 'POST') {
    return descriptor('scores.created', 'scores');
  }
  if (/^scores\/[^/]+\/revert$/.test(resource) && operation === 'POST') {
    return descriptor('scores.reverted', 'scores');
  }
  if (resource === 'score-periods/settle' && operation === 'POST') {
    return descriptor('scores.settled', 'scores');
  }
  if (resource === 'committee' && operation === 'PUT') {
    return descriptor('students.committee_updated', 'students');
  }
  if (resource === 'seat-layout' && operation === 'PUT') {
    return descriptor('seating.saved', 'seating');
  }
  if (/^seat-layout\/versions\/[^/]+\/restore$/.test(resource) && operation === 'POST') {
    return descriptor('seating.restored', 'seating');
  }
  if (resource === 'schedule' && operation === 'PUT') {
    return descriptor('schedule.saved', 'schedule');
  }
  if (resource === 'ranking' && operation === 'GET') return descriptor('ranking.viewed', 'ranking');
  if (resource === 'random-pick' && operation === 'POST') {
    return descriptor('random_pick.completed', 'random_pick');
  }
  if (resource === 'feedback' && operation === 'POST') {
    return descriptor('feedback.submitted', 'feedback');
  }
  if (/^display-devices(?:\/.*)?$/.test(resource) && operation === 'POST') {
    return descriptor('display_devices.updated', 'display_devices');
  }
  return null;
}

export class ApiClassroomService implements ClassroomService {
  private userRefreshPromise: Promise<boolean> | null = null;
  private displayRefreshPromise: Promise<boolean> | null = null;

  private async request<T>(
    path: string,
    init: RequestInit = {},
    options: RequestOptions = {},
  ): Promise<T> {
    const auth = options.auth ?? 'user';
    const headers = new Headers(init.headers);
    const requestId = options.requestId ?? headers.get('x-request-id') ?? createTraceId();
    const requestStartedAt = Date.now();
    const usageDescriptor = requestUsageDescriptor(path, init.method ?? 'GET');
    headers.set('x-request-id', requestId);
    if (init.body !== undefined && !(init.body instanceof FormData)) {
      headers.set('content-type', 'application/json');
    }

    const token =
      auth === 'user'
        ? getUserSession()?.accessToken
        : auth === 'display'
          ? getDisplaySession()?.accessToken
          : null;
    if (token) headers.set('authorization', `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetch(`${API_ORIGIN}/api/v1${path}`, { ...init, headers });
    } catch {
      const error = new ClassroomServiceError(
        'API_UNAVAILABLE',
        '无法连接到后端服务，请确认服务已启动',
        503,
      );
      this.reportRequestUsage(usageDescriptor, requestId, requestStartedAt, 'FAILURE', error.code);
      if (!options.suppressBackendUnavailable) reportBackendUnavailable(error.message);
      throw error;
    }

    if (response.status === 401 && options.retry !== false && auth !== 'none') {
      const refreshed =
        auth === 'user'
          ? await this.refreshUserSession(options.suppressBackendUnavailable)
          : await this.refreshDisplaySession(options.suppressBackendUnavailable);
      if (refreshed) {
        return this.request<T>(path, init, { ...options, requestId, retry: false });
      }
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = errorPayload(payload, response.status);
      this.reportRequestUsage(usageDescriptor, requestId, requestStartedAt, 'FAILURE', error.code);
      if (response.status >= 500 && !options.suppressBackendUnavailable) {
        reportBackendUnavailable(error.message);
      }
      throw error;
    }
    this.reportRequestUsage(usageDescriptor, requestId, requestStartedAt, 'SUCCESS');
    return (isEnvelope(payload) && !isPaginatedPayload(payload) ? payload.data : payload) as T;
  }

  private reportRequestUsage(
    descriptor: RequestUsageDescriptor | null,
    traceId: string,
    startedAt: number,
    result: 'SUCCESS' | 'FAILURE',
    errorCode?: string,
  ): void {
    if (!descriptor) return;
    const clientType =
      typeof window !== 'undefined' && window.location.pathname.startsWith('/teacher')
        ? 'TEACHER_MOBILE'
        : 'ADMIN_WEB';
    void reportUsageEventBestEffort(
      (input, options) => this.reportUsageEvent(input, options),
      {
        eventName: descriptor.eventName,
        clientType,
        classId: descriptor.classId,
        result,
        module: descriptor.module,
        page: typeof window === 'undefined' ? undefined : window.location.pathname,
        appVersion: import.meta.env.VITE_APP_VERSION || 'web',
        browser:
          typeof navigator === 'undefined' ? undefined : navigator.userAgent.slice(0, 255),
        traceId,
        errorCode,
        properties: { durationMs: Math.max(0, Date.now() - startedAt) },
      },
      { auth: 'user' },
    );
  }

  private refreshUserSession(suppressBackendUnavailable = false): Promise<boolean> {
    if (this.userRefreshPromise) return this.userRefreshPromise;
    this.userRefreshPromise = (async () => {
      const session = getUserSession();
      if (!session?.refreshToken) return false;
      try {
        const tokens = await this.request<TokenPair>(
          '/auth/refresh',
          { method: 'POST', body: jsonBody({ refreshToken: session.refreshToken }) },
          { auth: 'none', retry: false, suppressBackendUnavailable },
        );
        setUserSession({ ...session, ...tokens });
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      this.userRefreshPromise = null;
    });
    return this.userRefreshPromise;
  }

  private refreshDisplaySession(suppressBackendUnavailable = false): Promise<boolean> {
    if (this.displayRefreshPromise) return this.displayRefreshPromise;
    this.displayRefreshPromise = (async () => {
      const session = getDisplaySession();
      if (!session?.credential) return false;
      try {
        const token = await this.request<DeviceTokenResult>(
          '/display/auth/token',
          {
            method: 'POST',
            body: jsonBody({ deviceId: session.deviceId, credential: session.credential }),
          },
          { auth: 'none', retry: false, suppressBackendUnavailable },
        );
        setDisplaySession({
          ...session,
          accessToken: token.accessToken,
          expiresAt: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
        });
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      this.displayRefreshPromise = null;
    });
    return this.displayRefreshPromise;
  }

  async listClassrooms(): Promise<ClassroomSummary[]> {
    return this.request<ClassroomSummary[]>('/classes');
  }

  async getClassroom(classId: string): Promise<Classroom> {
    return this.request<Classroom>(`/classes/${encodeURIComponent(classId)}`);
  }

  async reportUsageEvent(
    input: UsageEventInput,
    options: ReportUsageEventOptions = {},
  ): Promise<UsageEventResponse> {
    const traceId = input.traceId || createTraceId();
    return this.request<UsageEventResponse>(
      '/telemetry/events',
      {
        method: 'POST',
        body: jsonBody({
          ...input,
          traceId,
          properties: sanitizeUsageEventProperties(input.properties),
        }),
      },
      {
        auth: options.auth ?? (input.clientType === 'DISPLAY' ? 'display' : 'user'),
        requestId: traceId,
        suppressBackendUnavailable: true,
      },
    );
  }

  async createFeedback(
    classId: string,
    input: CreateFeedbackInput,
  ): Promise<FeedbackCreateResult> {
    const traceId = input.traceId || createTraceId();
    return this.request<FeedbackCreateResult>(
      `/classes/${encodeURIComponent(classId)}/feedback`,
      {
        method: 'POST',
        body: jsonBody({ ...input, traceId }),
      },
      { requestId: traceId },
    );
  }

  async listFeedback(
    classId: string,
    query: FeedbackListQuery = {},
  ): Promise<PaginatedEnvelope<FeedbackListItem>> {
    return this.request<PaginatedEnvelope<FeedbackListItem>>(
      `/classes/${encodeURIComponent(classId)}/feedback${queryString(query)}`,
    );
  }

  async getFeedback(classId: string, feedbackId: string): Promise<FeedbackDetail> {
    return this.request<FeedbackDetail>(
      `/classes/${encodeURIComponent(classId)}/feedback/${encodeURIComponent(feedbackId)}`,
    );
  }

  async updateFeedback(
    classId: string,
    feedbackId: string,
    input: UpdateFeedbackInput,
  ): Promise<FeedbackDetail> {
    return this.request<FeedbackDetail>(
      `/classes/${encodeURIComponent(classId)}/feedback/${encodeURIComponent(feedbackId)}`,
      {
        method: 'PATCH',
        body: jsonBody(input),
      },
    );
  }

  async getUsageAnalytics(
    classId: string,
    query: UsageAnalyticsQuery = {},
  ): Promise<UsageAnalyticsSummary> {
    return this.request<UsageAnalyticsSummary>(
      `/classes/${encodeURIComponent(classId)}/analytics/summary${queryString(query)}`,
    );
  }

  async updateClassroom(classId: string, input: UpdateClassroomInput): Promise<Classroom> {
    return this.request<Classroom>(`/classes/${encodeURIComponent(classId)}`, {
      method: 'PATCH',
      body: jsonBody(input),
    });
  }

  async listStudents(
    classId: string,
    query: StudentListQuery = {},
  ): Promise<PaginatedEnvelope<Student>> {
    return this.request<PaginatedEnvelope<Student>>(
      `/classes/${encodeURIComponent(classId)}/students${queryString(query)}`,
    );
  }

  async createStudent(classId: string, input: CreateStudentInput): Promise<Student> {
    return this.request<Student>(`/classes/${encodeURIComponent(classId)}/students`, {
      method: 'POST',
      body: jsonBody(input),
    });
  }

  async updateStudent(
    classId: string,
    studentId: string,
    input: UpdateStudentInput,
  ): Promise<Student> {
    return this.request<Student>(
      `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`,
      {
        method: 'PATCH',
        body: jsonBody(input),
      },
    );
  }

  async deactivateStudent(classId: string, studentId: string): Promise<Student> {
    return this.request<Student>(
      `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/deactivate`,
      {
        method: 'POST',
      },
    );
  }

  async restoreStudent(classId: string, studentId: string): Promise<Student> {
    return this.request<Student>(
      `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/restore`,
      {
        method: 'POST',
      },
    );
  }

  async deleteStudent(classId: string, studentId: string): Promise<Student> {
    return this.request<Student>(
      `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/delete`,
      {
        method: 'POST',
      },
    );
  }

  async importStudents(
    classId: string,
    input: ImportedStudentInput[],
  ): Promise<StudentImportResult> {
    return this.request<StudentImportResult>(
      `/classes/${encodeURIComponent(classId)}/students/import`,
      {
        method: 'POST',
        body: jsonBody({ students: input }),
      },
    );
  }

  async listTeachers(classId: string): Promise<ClassTeacher[]> {
    return this.request<ClassTeacher[]>(`/classes/${encodeURIComponent(classId)}/teachers`);
  }

  async createTeacher(classId: string, input: CreateTeacherInput): Promise<CreateTeacherResult> {
    return this.request<CreateTeacherResult>(`/classes/${encodeURIComponent(classId)}/teachers`, {
      method: 'POST',
      body: jsonBody(input),
    });
  }

  async updateTeacher(
    classId: string,
    classTeacherId: string,
    input: UpdateTeacherInput,
  ): Promise<ClassTeacher> {
    return this.request<ClassTeacher>(
      `/classes/${encodeURIComponent(classId)}/teachers/${encodeURIComponent(classTeacherId)}`,
      {
        method: 'PATCH',
        body: jsonBody(input),
      },
    );
  }

  async createTeacherInvitation(
    classId: string,
    classTeacherId: string,
  ): Promise<TeacherInvitation> {
    return this.request<TeacherInvitation>(
      `/classes/${encodeURIComponent(classId)}/teachers/${encodeURIComponent(classTeacherId)}/invitations`,
      {
        method: 'POST',
      },
    );
  }

  async revokeTeacher(classId: string, classTeacherId: string): Promise<{ revoked: true }> {
    return this.request<{ revoked: true }>(
      `/classes/${encodeURIComponent(classId)}/teachers/${encodeURIComponent(classTeacherId)}/revoke`,
      {
        method: 'POST',
      },
    );
  }

  async deleteTeacher(classId: string, classTeacherId: string): Promise<{ deleted: true }> {
    return this.request<{ deleted: true }>(
      '/classes/' + encodeURIComponent(classId) + '/teachers/' + encodeURIComponent(classTeacherId),
      { method: 'DELETE' },
    );
  }

  async restoreTeacher(classId: string, classTeacherId: string): Promise<{ restored: true }> {
    return this.request<{ restored: true }>(
      `/classes/${encodeURIComponent(classId)}/teachers/${encodeURIComponent(classTeacherId)}/restore`,
      {
        method: 'POST',
      },
    );
  }

  async listScoreRules(classId: string, enabled?: boolean): Promise<ScoreRule[]> {
    return this.request<ScoreRule[]>(
      `/classes/${encodeURIComponent(classId)}/score-rules${queryString({ enabled })}`,
    );
  }

  async createScoreRule(classId: string, input: CreateScoreRuleInput): Promise<ScoreRule> {
    return this.request<ScoreRule>(`/classes/${encodeURIComponent(classId)}/score-rules`, {
      method: 'POST',
      body: jsonBody(input),
    });
  }

  async updateScoreRule(
    classId: string,
    ruleId: string,
    input: UpdateScoreRuleInput,
  ): Promise<ScoreRule> {
    return this.request<ScoreRule>(
      `/classes/${encodeURIComponent(classId)}/score-rules/${encodeURIComponent(ruleId)}`,
      {
        method: 'PATCH',
        body: jsonBody(input),
      },
    );
  }

  async disableScoreRule(classId: string, ruleId: string): Promise<ScoreRule> {
    return this.request<ScoreRule>(
      `/classes/${encodeURIComponent(classId)}/score-rules/${encodeURIComponent(ruleId)}/disable`,
      {
        method: 'POST',
      },
    );
  }

  async listScoreRecords(
    classId: string,
    query: ScoreRecordListQuery = {},
  ): Promise<PaginatedEnvelope<ScoreRecord>> {
    return this.request<PaginatedEnvelope<ScoreRecord>>(
      `/classes/${encodeURIComponent(classId)}/scores${queryString(query)}`,
    );
  }

  async createRuleScore(classId: string, input: CreateRuleScoreInput): Promise<ScoreRecord> {
    return this.request<ScoreRecord>(`/classes/${encodeURIComponent(classId)}/scores/rule`, {
      method: 'POST',
      body: jsonBody(input),
    });
  }

  async createCustomScore(classId: string, input: CreateCustomScoreInput): Promise<ScoreRecord> {
    return this.request<ScoreRecord>(`/classes/${encodeURIComponent(classId)}/scores/custom`, {
      method: 'POST',
      body: jsonBody(input),
    });
  }

  async revertScore(classId: string, recordId: string): Promise<ScoreRecord> {
    return this.request<ScoreRecord>(
      `/classes/${encodeURIComponent(classId)}/scores/${encodeURIComponent(recordId)}/revert`,
      {
        method: 'POST',
      },
    );
  }

  async createScoreEvent(classId: string, input: CreateScoreEventInput): Promise<ScoreEventResult> {
    return this.request<ScoreEventResult>(`/classes/${encodeURIComponent(classId)}/score-events`, {
      method: 'POST',
      body: jsonBody(input),
    });
  }

  async getCurrentScorePeriodSummary(classId: string): Promise<ScorePeriodSummary> {
    return this.request<ScorePeriodSummary>(
      `/classes/${encodeURIComponent(classId)}/score-periods/current/summary`,
    );
  }

  async getScorePeriodSummary(
    classId: string,
    query: { from?: IsoDateTime; to?: IsoDateTime } = {},
  ): Promise<ScorePeriodSummary> {
    return this.request<ScorePeriodSummary>(
      `/classes/${encodeURIComponent(classId)}/score-periods/summary${queryString(query)}`,
    );
  }

  async listCommittee(classId: string): Promise<CommitteeAssignment[]> {
    return this.request<CommitteeAssignment[]>(`/classes/${encodeURIComponent(classId)}/committee`);
  }

  async updateCommittee(
    classId: string,
    input: UpdateCommitteeInput,
  ): Promise<CommitteeAssignment[]> {
    return this.request<CommitteeAssignment[]>(
      `/classes/${encodeURIComponent(classId)}/committee`,
      {
        method: 'PUT',
        body: jsonBody(input),
      },
    );
  }

  async settleScorePeriods(classId: string, periodId?: string): Promise<{ settled: true }> {
    return this.request<{ settled: true }>(
      `/classes/${encodeURIComponent(classId)}/score-periods/settle`,
      {
        method: 'POST',
        body: jsonBody(periodId ? { periodId } : {}),
      },
    );
  }

  async getSeatLayout(classId: string): Promise<SeatLayout> {
    return this.request<SeatLayout>(`/classes/${encodeURIComponent(classId)}/seat-layout`);
  }

  async listSeatLayoutVersions(
    classId: string,
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedEnvelope<SeatLayoutVersionSummary>> {
    return this.request<PaginatedEnvelope<SeatLayoutVersionSummary>>(
      `/classes/${encodeURIComponent(classId)}/seat-layout/versions${queryString({ page, pageSize })}`,
    );
  }

  async getSeatLayoutVersion(classId: string, versionId: string): Promise<SeatLayoutVersion> {
    return this.request<SeatLayoutVersion>(
      `/classes/${encodeURIComponent(classId)}/seat-layout/versions/${encodeURIComponent(versionId)}`,
    );
  }

  async saveSeatLayout(classId: string, input: SaveSeatLayoutInput): Promise<SeatLayoutMutation> {
    return this.request<SeatLayoutMutation>(`/classes/${encodeURIComponent(classId)}/seat-layout`, {
      method: 'PUT',
      body: jsonBody(input),
    });
  }

  async restoreSeatLayout(
    classId: string,
    versionId: string,
  ): Promise<SeatLayoutMutation & { sourceVersionId: string }> {
    return this.request<SeatLayoutMutation & { sourceVersionId: string }>(
      `/classes/${encodeURIComponent(classId)}/seat-layout/versions/${encodeURIComponent(versionId)}/restore`,
      {
        method: 'POST',
      },
    );
  }

  async getSchedule(classId: string): Promise<ClassSchedule> {
    return this.request<ClassSchedule>(`/classes/${encodeURIComponent(classId)}/schedule`);
  }

  async saveSchedule(classId: string, input: SaveClassScheduleInput): Promise<ClassSchedule> {
    return this.request<ClassSchedule>(`/classes/${encodeURIComponent(classId)}/schedule`, {
      method: 'PUT',
      body: jsonBody(input),
    });
  }

  async getWeeklyRanking(classId: string): Promise<WeeklyRanking> {
    return this.request<WeeklyRanking>(`/classes/${encodeURIComponent(classId)}/ranking`);
  }

  async randomPick(classId: string, input: RandomPickInput = {}): Promise<RandomPickResult> {
    return this.request<RandomPickResult>(`/classes/${encodeURIComponent(classId)}/random-pick`, {
      method: 'POST',
      body: jsonBody(input),
    });
  }

  async createBindingCode(): Promise<CreateBindingCodeResult> {
    return this.request<CreateBindingCodeResult>(
      '/display/binding-codes',
      { method: 'POST' },
      { auth: 'none' },
    );
  }

  async createClassroomBindingCode(
    classId: string,
    name: string,
  ): Promise<CreateClassroomBindingCodeResult> {
    return this.request<CreateClassroomBindingCodeResult>(
      `/classes/${encodeURIComponent(classId)}/display-devices/binding-code`,
      {
        method: 'POST',
        body: jsonBody({ name }),
      },
    );
  }

  async getClassroomBindingSessionStatus(
    classId: string,
    sessionId: string,
  ): Promise<ClassroomBindingSessionStatus> {
    return this.request<ClassroomBindingSessionStatus>(
      `/classes/${encodeURIComponent(classId)}/display-devices/binding-sessions/${encodeURIComponent(sessionId)}`,
    );
  }

  async pollBindingSession(
    bindingSessionId: string,
    input: PollBindingSessionInput,
  ): Promise<PollBindingSessionResult> {
    return this.request<PollBindingSessionResult>(
      `/display/binding-sessions/${encodeURIComponent(bindingSessionId)}/poll`,
      {
        method: 'POST',
        body: jsonBody(input),
      },
      { auth: 'none' },
    );
  }

  async bindDisplayDevice(classId: string, input: BindDisplayInput): Promise<BindDisplayResult> {
    return this.request<BindDisplayResult>(
      `/classes/${encodeURIComponent(classId)}/display-devices/bind`,
      {
        method: 'POST',
        body: jsonBody(input),
      },
    );
  }

  async bindDisplayByCode(code: string): Promise<BindDisplayByCodeResult> {
    const result = await this.request<BindDisplayByCodeResult>(
      '/display/bind-by-code',
      {
        method: 'POST',
        body: jsonBody({ code }),
      },
      { auth: 'none' },
    );
    const token = await this.exchangeDeviceCredential({
      deviceId: result.deviceId,
      credential: result.credential,
    });
    setDisplaySession({
      deviceId: result.deviceId,
      classId: result.classroom.id,
      credential: result.credential,
      accessToken: token.accessToken,
      expiresAt: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
    });
    return result;
  }

  async listDisplayDevices(classId: string): Promise<DisplayDevice[]> {
    return this.request<DisplayDevice[]>(`/classes/${encodeURIComponent(classId)}/display-devices`);
  }

  async revokeDisplayDevice(classId: string, deviceId: string): Promise<BindDisplayResult> {
    return this.request<BindDisplayResult>(
      `/classes/${encodeURIComponent(classId)}/display-devices/${encodeURIComponent(deviceId)}/revoke`,
      {
        method: 'POST',
      },
    );
  }

  async exchangeDeviceCredential(input: DeviceTokenInput): Promise<DeviceTokenResult> {
    const result = await this.request<DeviceTokenResult>(
      '/display/auth/token',
      {
        method: 'POST',
        body: jsonBody(input),
      },
      { auth: 'none' },
    );
    setDisplaySession({
      deviceId: input.deviceId,
      credential: input.credential,
      accessToken: result.accessToken,
      expiresAt: new Date(Date.now() + result.expiresIn * 1000).toISOString(),
    });
    return result;
  }

  async getDisplayBootstrap(deviceId: string): Promise<DisplayBootstrap> {
    const session = getDisplaySession();
    if (!session || session.deviceId !== deviceId) {
      throw new ClassroomServiceError('DISPLAY_SESSION_MISSING', '请先完成大屏绑定', 401);
    }
    const bootstrap = await this.request<DisplayBootstrap>('/display/bootstrap', undefined, {
      auth: 'display',
    });

    // Older display sessions did not persist classId. REST bootstrap still works
    // for those sessions, but realtime cannot join the class room without it.
    // Repair the local session from the authenticated server response so the
    // existing auth-change listener reconnects Socket.IO immediately.
    if (session.classId !== bootstrap.classroom.id) {
      setDisplaySession({ ...session, classId: bootstrap.classroom.id });
    }

    return bootstrap;
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const result = await this.request<LoginResult>(
      '/auth/login',
      {
        method: 'POST',
        body: jsonBody(input),
      },
      { auth: 'none' },
    );
    setUserSession(result);
    return result;
  }

  async logout(): Promise<LogoutResult> {
    const result = await this.request<LogoutResult>('/auth/logout', { method: 'POST' });
    clearUserSession();
    return result;
  }

  async refresh(input: RefreshInput): Promise<TokenPair> {
    const tokens = await this.request<TokenPair>(
      '/auth/refresh',
      {
        method: 'POST',
        body: jsonBody(input),
      },
      { auth: 'none' },
    );
    const current = getUserSession();
    if (current) setUserSession({ ...current, ...tokens });
    return tokens;
  }

  async getInvitationPreview(token: string): Promise<InvitationPreview> {
    const path = '/auth/invitations/' + encodeURIComponent(token) + '/preview';
    return this.request<InvitationPreview>(path, undefined, { auth: 'none' });
  }

  async consumeInvitation(
    token: string,
    input: ConsumeInvitationInput,
  ): Promise<InvitationConsumeResult> {
    const result = await this.request<InvitationConsumeResult>(
      `/auth/invitations/${encodeURIComponent(token)}/consume`,
      {
        method: 'POST',
        body: jsonBody(input),
      },
      { auth: 'none' },
    );
    setUserSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: { id: result.teacher.id, name: result.teacher.name },
    });
    setActiveClassId(result.classroom.id);
    return result;
  }
}

export const apiClassroomService = new ApiClassroomService();
