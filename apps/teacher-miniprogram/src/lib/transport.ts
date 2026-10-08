export const SESSION_STORAGE_KEY = 'teacher-miniprogram:session:v1';
export const ACTIVE_CLASS_STORAGE_KEY = 'teacher-miniprogram:active-class:v1';
export const PENDING_WRITE_STORAGE_PREFIX = 'teacher-miniprogram:pending-';

export interface TeacherSession {
  accessToken: string;
  refreshToken: string;
  teacher: { id: string; name: string };
  classes?: unknown[];
}

export interface StorageAdapter {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  remove(key: string): void;
  clearPendingPayloads?(): void;
}

export interface MinimalPendingWriteReceipt {
  teacherId: string;
  classId: string;
  input: { businessKey?: string; idempotencyKey?: string };
  lookupOnly: true;
}

export function minimizePendingWrite(value: unknown): MinimalPendingWriteReceipt | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as {
    teacherId?: unknown;
    classId?: unknown;
    input?: unknown;
  };
  if (
    typeof record.teacherId !== 'string' ||
    !record.teacherId.trim() ||
    typeof record.classId !== 'string' ||
    !record.classId.trim() ||
    !record.input ||
    typeof record.input !== 'object'
  ) {
    return null;
  }
  const input = record.input as { businessKey?: unknown; idempotencyKey?: unknown };
  if (typeof input.businessKey === 'string' && input.businessKey.trim()) {
    return {
      teacherId: record.teacherId,
      classId: record.classId,
      input: { businessKey: input.businessKey },
      lookupOnly: true,
    };
  }
  if (typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim()) {
    return {
      teacherId: record.teacherId,
      classId: record.classId,
      input: { idempotencyKey: input.idempotencyKey },
      lookupOnly: true,
    };
  }
  return null;
}

export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  header: Record<string, string>;
  data?: unknown;
}

export interface HttpResponse<T = unknown> {
  statusCode: number;
  data: T;
}

export interface HttpAdapter {
  request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;
}

export function unwrapHttpResponse<T>(response: HttpResponse<unknown>): HttpResponse<T> {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    return response as HttpResponse<T>;
  }
  const body = response.data;
  if (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'data' in body &&
    !('meta' in body)
  ) {
    return { statusCode: response.statusCode, data: (body as { data: T }).data };
  }
  return response as HttpResponse<T>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class StaleClassResponseError extends Error {
  constructor(
    readonly requestedClassId: string,
    readonly activeClassId: string | null,
  ) {
    super('当前班级已切换，已忽略旧班级响应');
    this.name = 'StaleClassResponseError';
  }
}

export class StaleSessionResponseError extends Error {
  constructor() {
    super('会话已变化，已忽略旧请求响应');
    this.name = 'StaleSessionResponseError';
  }
}

export interface RequestOptions {
  method?: HttpRequest['method'];
  data?: unknown;
  classId?: string;
  authenticated?: boolean;
  retryAfter401?: boolean;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function parseApiError(statusCode: number, data: unknown): ApiError {
  if (data && typeof data === 'object') {
    const body = data as { code?: unknown; message?: unknown; requestId?: unknown };
    return new ApiError(
      typeof body.message === 'string' ? body.message : `请求失败（${statusCode}）`,
      statusCode,
      typeof body.code === 'string' ? body.code : undefined,
      typeof body.requestId === 'string' ? body.requestId : undefined,
    );
  }
  return new ApiError(`请求失败（${statusCode}）`, statusCode);
}

export class ApiClient {
  private readonly refreshPromises = new Map<string, Promise<TeacherSession | null>>();
  private activeClassId: string | null;
  private classGeneration = 0;
  private sessionGeneration = 0;

  constructor(
    private readonly origin: string,
    private readonly http: HttpAdapter,
    private readonly storage: StorageAdapter,
  ) {
    const stored = storage.get(ACTIVE_CLASS_STORAGE_KEY);
    this.activeClassId = typeof stored === 'string' ? stored : null;
  }

  getSession(): TeacherSession | null {
    const stored = this.storage.get(SESSION_STORAGE_KEY);
    if (!stored || typeof stored !== 'object') return null;
    const value = stored as Partial<TeacherSession>;
    if (
      typeof value.accessToken !== 'string' ||
      typeof value.refreshToken !== 'string' ||
      !value.teacher ||
      typeof value.teacher.id !== 'string' ||
      typeof value.teacher.name !== 'string'
    ) {
      this.clearSession();
      return null;
    }
    return value as TeacherSession;
  }

  setSession(session: TeacherSession): void {
    this.sessionGeneration += 1;
    this.storage.set(SESSION_STORAGE_KEY, session);
  }

  clearSession(): void {
    this.sessionGeneration += 1;
    this.storage.remove(SESSION_STORAGE_KEY);
    this.setActiveClassId(null);
    this.storage.clearPendingPayloads?.();
  }

  clearSessionIfCurrent(accessToken: string, refreshToken: string): void {
    const current = this.getSession();
    if (current?.accessToken === accessToken && current.refreshToken === refreshToken) {
      this.clearSession();
    }
  }

  getActiveClassId(): string | null {
    return this.activeClassId;
  }

  setActiveClassId(classId: string | null): void {
    if (classId === this.activeClassId) return;
    this.activeClassId = classId;
    this.classGeneration += 1;
    if (classId) this.storage.set(ACTIVE_CLASS_STORAGE_KEY, classId);
    else this.storage.remove(ACTIVE_CLASS_STORAGE_KEY);
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const authenticated = options.authenticated !== false;
    const generation = options.classId ? this.classGeneration : undefined;
    this.assertClassCurrent(options.classId, generation);
    const sentSession = authenticated ? this.getSession() : null;
    if (authenticated && !sentSession) {
      throw new ApiError('请先登录', 401, 'UNAUTHENTICATED');
    }
    const sentSessionGeneration = this.sessionGeneration;
    const first = await this.send<T>(path, options, sentSession?.accessToken);
    this.assertSessionCurrent(sentSessionGeneration);
    this.assertClassCurrent(options.classId, generation);

    if (first.statusCode === 401 && authenticated && options.retryAfter401 !== false) {
      this.assertClassCurrent(options.classId, generation);
      this.assertSessionCurrent(sentSessionGeneration);
      if (sentSessionGeneration !== this.sessionGeneration) {
        throw parseApiError(first.statusCode, first.data);
      }
      let currentSession = this.getSession();
      if (!currentSession) throw parseApiError(first.statusCode, first.data);
      if (currentSession.accessToken === sentSession?.accessToken) {
        currentSession = await this.refreshSingleFlight();
      }
      this.assertClassCurrent(options.classId, generation);
      this.assertSessionCurrent(sentSessionGeneration);
      if (sentSessionGeneration !== this.sessionGeneration) {
        throw parseApiError(first.statusCode, first.data);
      }
      if (!currentSession) throw parseApiError(first.statusCode, first.data);
      const retried = await this.send<T>(path, options, currentSession.accessToken);
      this.assertSessionCurrent(sentSessionGeneration);
      this.assertClassCurrent(options.classId, generation);
      if (retried.statusCode === 401) this.clearSession();
      this.throwOnError(retried);
      return retried.data;
    }

    this.throwOnError(first);
    return first.data;
  }

  refreshSession(): Promise<TeacherSession | null> {
    return this.refreshSingleFlight();
  }

  async logout(): Promise<void> {
    const session = this.getSession();
    this.clearSession();
    if (!session) return;

    const response = await this.http.request<unknown>({
      url: `${this.origin.replace(/\/$/, '')}/auth/logout`,
      method: 'POST',
      header: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
    });
    this.throwOnError(response);
  }

  private async send<T>(
    path: string,
    options: RequestOptions,
    accessToken?: string,
  ): Promise<HttpResponse<T>> {
    const header: Record<string, string> = { Accept: 'application/json' };
    if (options.data !== undefined) header['Content-Type'] = 'application/json';
    if (accessToken) header.Authorization = `Bearer ${accessToken}`;
    return this.http.request<T>({
      url: `${this.origin.replace(/\/$/, '')}${path}`,
      method: options.method ?? 'GET',
      header,
      data: options.data,
    });
  }

  private throwOnError<T>(response: HttpResponse<T>): void {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw parseApiError(response.statusCode, response.data);
    }
  }

  private assertClassCurrent(classId?: string, generation?: number): void {
    if (classId && (generation !== this.classGeneration || classId !== this.activeClassId)) {
      throw new StaleClassResponseError(classId, this.activeClassId);
    }
  }

  private assertSessionCurrent(generation: number): void {
    if (generation !== this.sessionGeneration) throw new StaleSessionResponseError();
  }

  private async refreshSingleFlight(): Promise<TeacherSession | null> {
    const current = this.getSession();
    if (!current) return null;
    const generation = this.sessionGeneration;
    const pending = this.refreshPromises.get(current.refreshToken);
    if (pending) return pending;

    const refresh = (async () => {
      try {
        const response = await this.http.request<TokenPair>({
          url: `${this.origin.replace(/\/$/, '')}/auth/refresh`,
          method: 'POST',
          header: { Accept: 'application/json', 'Content-Type': 'application/json' },
          data: { refreshToken: current.refreshToken },
        });
        const latest = this.getSession();
        if (
          generation !== this.sessionGeneration ||
          latest?.refreshToken !== current.refreshToken
        ) {
          return null;
        }
        if (
          response.statusCode < 200 ||
          response.statusCode >= 300 ||
          typeof response.data?.accessToken !== 'string' ||
          typeof response.data?.refreshToken !== 'string'
        ) {
          this.clearSessionIfCurrent(current.accessToken, current.refreshToken);
          return null;
        }
        const updated = { ...latest, ...response.data };
        this.storage.set(SESSION_STORAGE_KEY, updated);
        return updated;
      } catch {
        this.clearSessionIfCurrent(current.accessToken, current.refreshToken);
        return null;
      }
    })();

    this.refreshPromises.set(current.refreshToken, refresh);
    try {
      return await refresh;
    } finally {
      if (this.refreshPromises.get(current.refreshToken) === refresh) {
        this.refreshPromises.delete(current.refreshToken);
      }
    }
  }
}
