import Taro from '@tarojs/taro';
import {
  ApiClient,
  minimizePendingWrite,
  PENDING_WRITE_STORAGE_PREFIX,
  unwrapHttpResponse,
  type TeacherSession,
} from './transport';
import type {
  Announcement,
  ClassroomSummary,
  CreateAnnouncementInput,
  CreateScoreEventInput,
  PaginatedEnvelope,
  RandomPickInput,
  RandomPickResult,
  ScoreEventResult,
  ScoreRecord,
  ScoreRecordListQuery,
  SeatLayout,
  Student,
  StudentListQuery,
} from '../../../web/src/lib/domain';

const API_ORIGIN = process.env.TARO_APP_API_ORIGIN || 'http://127.0.0.1:3000/api/v1';

const httpAdapter = {
  request<T>(request: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    header: Record<string, string>;
    data?: unknown;
  }) {
    return new Promise<{ statusCode: number; data: T }>((resolve, reject) => {
      Taro.request<T>({
        url: request.url,
        method: request.method,
        header: request.header,
        data: request.data,
        success: (response) =>
          resolve(
            unwrapHttpResponse<T>({
              statusCode: response.statusCode,
              data: response.data as unknown,
            }),
          ),
        fail: reject,
      });
    });
  },
};

const storageAdapter = {
  get: (key: string) => Taro.getStorageSync(key) as unknown,
  set: (key: string, value: unknown) => Taro.setStorageSync(key, value),
  remove: (key: string) => Taro.removeStorageSync(key),
  clearPendingPayloads: () => {
    try {
      const keys = Taro.getStorageInfoSync().keys;
      for (const key of keys) {
        if (key.startsWith(PENDING_WRITE_STORAGE_PREFIX)) {
          try {
            const minimal = minimizePendingWrite(Taro.getStorageSync(key));
            if (minimal) Taro.setStorageSync(key, minimal);
            else Taro.removeStorageSync(key);
          } catch {
            // A corrupt record is safer removed than retained with private payload data.
            try {
              Taro.removeStorageSync(key);
            } catch {
              // A storage failure should not interrupt local logout.
            }
          }
        }
      }
    } catch {
      // Storage cleanup must not interrupt local logout.
    }
  },
};

export const apiClient = new ApiClient(API_ORIGIN, httpAdapter, storageAdapter);

export type { TeacherSession } from './transport';
export type {
  Announcement,
  ClassroomSummary,
  CreateAnnouncementInput,
  CreateScoreEventInput,
  InvitationPreview,
  PaginatedEnvelope,
  RandomPickInput,
  RandomPickResult,
  ScoreEventResult,
  ScoreEventType,
  ScoreRecord,
  ScoreRecordListQuery,
  SeatLayout,
  Student,
  StudentListQuery,
} from '../../../web/src/lib/domain';

export interface BoundWechatLoginResult {
  status: 'BOUND';
  accessToken: string;
  refreshToken: string;
  teacher: { id: string; name: string };
}

export interface UnboundWechatLoginResult {
  status: 'UNBOUND';
  ticket: string;
}

export type WechatLoginResult = BoundWechatLoginResult | UnboundWechatLoginResult;

export interface BoundWechatBindResult {
  status: 'BOUND';
  accessToken: string;
  refreshToken: string;
  teacher: { id: string; name: string };
  classroom: Pick<ClassroomSummary, 'id' | 'name'>;
}

export interface InvitationPreviewResult {
  teacher: { id: string; name: string; subject: string | null };
  classroom: { id: string; name: string };
  headTeacher: { id: string; name: string };
  expiresAt: string;
}

export function getSession(): TeacherSession | null {
  return apiClient.getSession();
}

export function clearSession(): void {
  apiClient.clearSession();
}

export function getActiveClassId(): string | null {
  return apiClient.getActiveClassId();
}

export function setActiveClassId(classId: string | null): void {
  apiClient.setActiveClassId(classId);
}

export function refreshSession(): Promise<TeacherSession | null> {
  return apiClient.refreshSession();
}

export async function wechatLogin(code: string): Promise<WechatLoginResult> {
  const result = await apiClient.request<WechatLoginResult>('/auth/wechat/login', {
    method: 'POST',
    data: { code },
    authenticated: false,
  });
  if (result.status === 'BOUND') {
    apiClient.setSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      teacher: result.teacher,
    });
  } else {
    apiClient.clearSession();
  }
  return result;
}

export async function previewInvitation(token: string): Promise<InvitationPreviewResult> {
  return apiClient.request<InvitationPreviewResult>(
    `/auth/wechat/invitations/${encodeURIComponent(token)}/preview`,
    { authenticated: false },
  );
}

export async function bindWechat(ticket: string, token: string): Promise<BoundWechatBindResult> {
  const result = await apiClient.request<BoundWechatBindResult>('/auth/wechat/bind', {
    method: 'POST',
    data: { ticket, token },
    authenticated: false,
  });
  apiClient.setSession({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    teacher: result.teacher,
    classes: [result.classroom],
  });
  return result;
}

export function logout(): Promise<void> {
  return apiClient.logout();
}

export function listClassrooms(): Promise<ClassroomSummary[]> {
  return apiClient.request<ClassroomSummary[]>('/classes');
}

export function listStudents(
  classId: string,
  query: StudentListQuery = {},
): Promise<PaginatedEnvelope<Student>> {
  return apiClient.request<PaginatedEnvelope<Student>>(
    `/classes/${encodeURIComponent(classId)}/students${toQuery(query)}`,
    { classId },
  );
}

export async function listAllStudents(
  classId: string,
  query: Omit<StudentListQuery, 'page' | 'pageSize'> = {},
): Promise<Student[]> {
  const pageSize = 100;
  const first = await listStudents(classId, { ...query, page: 1, pageSize });
  const pageCount = Math.ceil(first.meta.total / first.meta.pageSize);
  if (pageCount <= 1) return first.data;
  const remaining = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      listStudents(classId, { ...query, page: index + 2, pageSize }),
    ),
  );
  return [first, ...remaining].flatMap((page) => page.data);
}

export function getSeatLayout(classId: string): Promise<SeatLayout> {
  return apiClient.request<SeatLayout>(`/classes/${encodeURIComponent(classId)}/seat-layout`, {
    classId,
  });
}

export function createScoreEvent(
  classId: string,
  input: CreateScoreEventInput,
): Promise<ScoreEventResult> {
  return apiClient.request<ScoreEventResult>(
    `/classes/${encodeURIComponent(classId)}/score-events`,
    { method: 'POST', data: input, classId },
  );
}

export function getScoreEventByKey(
  classId: string,
  businessKey: string,
): Promise<ScoreEventResult> {
  return apiClient.request<ScoreEventResult>(
    `/classes/${encodeURIComponent(classId)}/score-events/by-key/${encodeURIComponent(businessKey)}`,
    { classId },
  );
}

export function listScoreRecords(
  classId: string,
  query: ScoreRecordListQuery = {},
): Promise<PaginatedEnvelope<ScoreRecord>> {
  return apiClient.request<PaginatedEnvelope<ScoreRecord>>(
    `/classes/${encodeURIComponent(classId)}/scores${toQuery(query)}`,
    { classId },
  );
}

export function revertScoreRecord(classId: string, recordId: string): Promise<ScoreRecord> {
  return apiClient.request<ScoreRecord>(
    `/classes/${encodeURIComponent(classId)}/scores/${encodeURIComponent(recordId)}/revert`,
    { method: 'POST', classId },
  );
}

export const revertScore = revertScoreRecord;

export function randomPick(
  classId: string,
  input: RandomPickInput = {},
): Promise<RandomPickResult> {
  return apiClient.request<RandomPickResult>(
    `/classes/${encodeURIComponent(classId)}/random-pick`,
    { method: 'POST', data: input, classId },
  );
}

export function listAnnouncements(classId: string): Promise<Announcement[]> {
  return apiClient.request<Announcement[]>(
    `/classes/${encodeURIComponent(classId)}/announcements`,
    { classId },
  );
}

export function getAnnouncement(classId: string, id: string): Promise<Announcement> {
  return apiClient.request<Announcement>(
    `/classes/${encodeURIComponent(classId)}/announcements/${encodeURIComponent(id)}`,
    { classId },
  );
}

export function getAnnouncementByKey(
  classId: string,
  idempotencyKey: string,
): Promise<Announcement> {
  return apiClient.request<Announcement>(
    `/classes/${encodeURIComponent(classId)}/announcements/by-key/${encodeURIComponent(idempotencyKey)}`,
    { classId },
  );
}

export function createAnnouncement(
  classId: string,
  input: CreateAnnouncementInput,
): Promise<Announcement> {
  return apiClient.request<Announcement>(`/classes/${encodeURIComponent(classId)}/announcements`, {
    method: 'POST',
    data: input,
    classId,
  });
}

export function endAnnouncement(classId: string, id: string): Promise<Announcement> {
  return apiClient.request<Announcement>(
    `/classes/${encodeURIComponent(classId)}/announcements/${encodeURIComponent(id)}/end`,
    { method: 'POST', classId },
  );
}

function toQuery(query: object): string {
  const params = Object.entries(query as Record<string, unknown>).filter(
    ([, value]) =>
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
  );
  if (!params.length) return '';
  const pairs = params.map(
    ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
  );
  return `?${pairs.join('&')}`;
}
