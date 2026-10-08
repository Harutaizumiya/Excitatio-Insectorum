import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_CLASS_STORAGE_KEY,
  ApiClient,
  ApiError,
  SESSION_STORAGE_KEY,
  PENDING_WRITE_STORAGE_PREFIX,
  StaleClassResponseError,
  StaleSessionResponseError,
  minimizePendingWrite,
  unwrapHttpResponse,
  type HttpAdapter,
  type HttpRequest,
  type HttpResponse,
  type StorageAdapter,
  type TeacherSession,
} from './transport.ts';

class MemoryStorage implements StorageAdapter {
  readonly values = new Map<string, unknown>();
  get(key: string): unknown {
    return this.values.get(key);
  }
  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }
  remove(key: string): void {
    this.values.delete(key);
  }
  clearPendingPayloads(): void {
    for (const key of this.values.keys()) {
      if (!key.startsWith(PENDING_WRITE_STORAGE_PREFIX)) continue;
      const minimal = minimizePendingWrite(this.values.get(key));
      if (minimal) this.values.set(key, minimal);
      else this.values.delete(key);
    }
  }
}

const oldSession: TeacherSession = {
  accessToken: 'access-old',
  refreshToken: 'refresh-old',
  teacher: { id: 'teacher-1', name: '老师' },
};

function makeClient(respond: (request: HttpRequest) => Promise<HttpResponse> | HttpResponse) {
  const storage = new MemoryStorage();
  const http: HttpAdapter = {
    async request<T>(request: HttpRequest) {
      return unwrapHttpResponse<T>((await respond(request)) as HttpResponse<unknown>);
    },
  };
  const client = new ApiClient('https://api.example.test/api/v1', http, storage);
  client.setSession(oldSession);
  return { client, storage };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const unauthorized: HttpResponse = {
  statusCode: 401,
  data: { code: 'INVALID_ACCESS_TOKEN', message: '会话已过期' },
};

test('parallel explicit 401 responses share one refresh and replay each request once', async () => {
  let refreshCount = 0;
  const { client } = makeClient(async (request) => {
    if (request.url.endsWith('/auth/refresh')) {
      refreshCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        statusCode: 200,
        data: { data: { accessToken: 'access-new', refreshToken: 'refresh-new' } },
      };
    }
    if (request.header.Authorization === 'Bearer access-old') return unauthorized;
    return { statusCode: 200, data: { ok: true } };
  });

  await Promise.all([
    client.request('/classes/a/students'),
    client.request('/classes/a/seat-layout'),
  ]);

  assert.equal(refreshCount, 1);
  assert.equal(client.getSession()?.accessToken, 'access-new');
});

test('logout while refresh is pending cannot restore the cleared session', async () => {
  const refreshStarted = deferred<void>();
  const releaseRefresh = deferred<HttpResponse>();
  const { client } = makeClient((request) => {
    if (request.url.endsWith('/auth/refresh')) {
      refreshStarted.resolve();
      return releaseRefresh.promise;
    }
    return unauthorized;
  });

  const pending = client.request('/classes/a/students');
  await refreshStarted.promise;
  client.clearSession();
  releaseRefresh.resolve({
    statusCode: 200,
    data: { accessToken: 'late-access', refreshToken: 'late-refresh' },
  });

  await assert.rejects(pending, StaleSessionResponseError);
  assert.equal(client.getSession(), null);
});

test('logout clears locally before sending one request with the captured access token', async () => {
  const logoutStarted = deferred<HttpRequest>();
  const releaseLogout = deferred<HttpResponse>();
  const { client } = makeClient((request) => {
    logoutStarted.resolve(request);
    return releaseLogout.promise;
  });

  const pending = client.logout();
  assert.equal(client.getSession(), null);
  const logoutRequest = await logoutStarted.promise;
  assert.equal(logoutRequest.url, 'https://api.example.test/api/v1/auth/logout');
  assert.equal(logoutRequest.method, 'POST');
  assert.equal(logoutRequest.header.Authorization, 'Bearer access-old');

  const nextSession: TeacherSession = {
    accessToken: 'next-access',
    refreshToken: 'next-refresh',
    teacher: { id: 'teacher-2', name: '另一位老师' },
  };
  client.setSession(nextSession);
  releaseLogout.resolve({ statusCode: 200, data: { ok: true } });
  await pending;
  assert.deepEqual(client.getSession(), nextSession);
});

test('a refresh started for one teacher cannot overwrite a later login', async () => {
  const refreshStarted = deferred<void>();
  const releaseRefresh = deferred<HttpResponse>();
  const { client } = makeClient((request) => {
    if (request.url.endsWith('/auth/refresh')) {
      refreshStarted.resolve();
      return releaseRefresh.promise;
    }
    return unauthorized;
  });

  const pending = client.request('/classes/a/students');
  await refreshStarted.promise;
  client.setSession({
    accessToken: 'other-access',
    refreshToken: 'other-refresh',
    teacher: { id: 'teacher-2', name: '另一位老师' },
  });
  releaseRefresh.resolve({
    statusCode: 200,
    data: { accessToken: 'late-access', refreshToken: 'late-refresh' },
  });

  await assert.rejects(pending, StaleSessionResponseError);
  assert.equal(client.getSession()?.teacher.id, 'teacher-2');
  assert.equal(client.getSession()?.accessToken, 'other-access');
});

test('a delayed replay 401 cannot clear a different teacher session', async () => {
  const replayStarted = deferred<void>();
  const releaseReplay = deferred<HttpResponse>();
  const { client } = makeClient((request) => {
    if (request.url.endsWith('/auth/refresh')) {
      return {
        statusCode: 200,
        data: { accessToken: 'access-refreshed', refreshToken: 'refresh-refreshed' },
      };
    }
    if (request.header.Authorization === 'Bearer access-old') return unauthorized;
    replayStarted.resolve();
    return releaseReplay.promise;
  });

  const pending = client.request('/classes/a/students');
  await replayStarted.promise;
  const nextSession: TeacherSession = {
    accessToken: 'other-access',
    refreshToken: 'other-refresh',
    teacher: { id: 'teacher-2', name: '另一位老师' },
  };
  client.setSession(nextSession);
  releaseReplay.resolve(unauthorized);

  await assert.rejects(pending, StaleSessionResponseError);
  assert.deepEqual(client.getSession(), nextSession);
});

test('a successful response from a previous session is ignored after logout', async () => {
  const releaseResponse = deferred<HttpResponse>();
  const { client } = makeClient(() => releaseResponse.promise);
  const pending = client.request('/classes/a/students');
  client.clearSession();
  releaseResponse.resolve({ statusCode: 200, data: { data: [] } });

  await assert.rejects(pending, StaleSessionResponseError);
});

test('a class switch while refresh is pending prevents replaying the old class request', async () => {
  const refreshStarted = deferred<void>();
  const releaseRefresh = deferred<HttpResponse>();
  let protectedRequests = 0;
  const { client } = makeClient((request) => {
    if (request.url.endsWith('/auth/refresh')) {
      refreshStarted.resolve();
      return releaseRefresh.promise;
    }
    protectedRequests += 1;
    return unauthorized;
  });
  client.setActiveClassId('class-a');

  const pending = client.request('/classes/class-a/score-events', {
    method: 'POST',
    data: { businessKey: 'once' },
    classId: 'class-a',
  });
  await refreshStarted.promise;
  client.setActiveClassId('class-b');
  releaseRefresh.resolve({
    statusCode: 200,
    data: { accessToken: 'access-new', refreshToken: 'refresh-new' },
  });

  await assert.rejects(pending, StaleClassResponseError);
  assert.equal(protectedRequests, 1);
  assert.equal(client.getActiveClassId(), 'class-b');
});

test('public auth requests and non-401 failures never refresh or replay', async () => {
  let requestCount = 0;
  let refreshCount = 0;
  const { client } = makeClient((request) => {
    requestCount += 1;
    if (request.url.endsWith('/auth/refresh')) refreshCount += 1;
    return request.url.endsWith('/auth/wechat/login')
      ? unauthorized
      : { statusCode: 503, data: { message: '服务暂不可用' } };
  });

  await assert.rejects(client.request('/auth/wechat/login', { authenticated: false }), ApiError);
  await assert.rejects(client.request('/classes/a/students'), ApiError);
  assert.equal(requestCount, 2);
  assert.equal(refreshCount, 0);
});

test('HTTP envelopes unwrap normal data, preserve pagination metadata, and keep error fields', async () => {
  const teacher = { status: 'BOUND', accessToken: 'a', refreshToken: 'r' };
  assert.deepEqual(unwrapHttpResponse({ statusCode: 200, data: { data: teacher } }), {
    statusCode: 200,
    data: teacher,
  });
  const page = { data: [{ id: 'student-1' }], meta: { page: 1, pageSize: 100, total: 1 } };
  assert.deepEqual(unwrapHttpResponse({ statusCode: 200, data: page }), {
    statusCode: 200,
    data: page,
  });
  const failure = { code: 'INVALID_INVITATION', message: '邀请已过期', requestId: 'req-1' };
  assert.deepEqual(unwrapHttpResponse({ statusCode: 400, data: failure }), {
    statusCode: 400,
    data: failure,
  });
});

test('storage uses isolated mini-program namespaced keys', () => {
  const { client, storage } = makeClient(() => ({ statusCode: 200, data: {} }));
  client.setActiveClassId('class-a');
  assert.ok(storage.values.has(SESSION_STORAGE_KEY));
  assert.equal(storage.values.get(ACTIVE_CLASS_STORAGE_KEY), 'class-a');
});

test('clearing session minimizes pending records and preserves only lookup receipts', () => {
  const { client, storage } = makeClient(() => ({ statusCode: 200, data: {} }));
  const scoreKey = `${PENDING_WRITE_STORAGE_PREFIX}score:teacher-1:class-a`;
  const announcementKey = `${PENDING_WRITE_STORAGE_PREFIX}announcement:teacher-1:class-a`;
  const invalidKey = `${PENDING_WRITE_STORAGE_PREFIX}invalid`;
  storage.set(scoreKey, {
    teacherId: 'teacher-1',
    classId: 'class-a',
    input: { businessKey: 'score-key', studentIds: ['student-1'], reason: '敏感原因' },
  });
  storage.set(announcementKey, {
    teacherId: 'teacher-1',
    classId: 'class-a',
    input: { idempotencyKey: 'announcement-key', studentId: 'student-2', text: '敏感内容' },
  });
  storage.set(invalidKey, { classId: 'class-a', input: { text: '无去重键' } });
  storage.set('another-app:pending-write', { keep: true });

  client.clearSession();

  assert.deepEqual(storage.values.get(scoreKey), {
    teacherId: 'teacher-1',
    classId: 'class-a',
    input: { businessKey: 'score-key' },
    lookupOnly: true,
  });
  assert.deepEqual(storage.values.get(announcementKey), {
    teacherId: 'teacher-1',
    classId: 'class-a',
    input: { idempotencyKey: 'announcement-key' },
    lookupOnly: true,
  });
  assert.equal(storage.values.has(invalidKey), false);
  assert.deepEqual(storage.values.get('another-app:pending-write'), { keep: true });
});
