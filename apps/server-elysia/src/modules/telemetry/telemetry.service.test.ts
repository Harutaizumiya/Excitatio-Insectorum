import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient, UsageClientType, UsageEventResult } from '@prisma/client';
import { PrincipalType } from '../../plugins/auth';
import { BusinessError } from '../../plugins/error-handler';
import { TelemetryService, normalizePage, sanitizeEventProperties } from './telemetry.service';

test('telemetry properties accept only the bounded analytics whitelist', () => {
  assert.deepEqual(
    sanitizeEventProperties({ totalCount: 12, operationMode: 'batch', reconnectCount: 1 }),
    { totalCount: 12, operationMode: 'batch', reconnectCount: 1 },
  );
  assert.throws(
    () => sanitizeEventProperties({ studentName: '不应保存' }),
    (error: unknown) =>
      error instanceof BusinessError && error.code === 'TELEMETRY_PROPERTY_NOT_ALLOWED',
  );
  assert.throws(
    () => sanitizeEventProperties({ description: '自由文本' }),
    (error: unknown) =>
      error instanceof BusinessError && error.code === 'TELEMETRY_PROPERTY_NOT_ALLOWED',
  );
});

test('telemetry removes query and hash data from page paths', () => {
  assert.equal(normalizePage('/admin/students?keyword=张三#result'), '/admin/students');
});

test('display telemetry cannot override the token classroom', async () => {
  const service = new TelemetryService({} as PrismaClient);
  await assert.rejects(
    service.record(
      {
        eventName: 'display.heartbeat',
        clientType: UsageClientType.DISPLAY,
        classId: 'other-class',
        result: UsageEventResult.SUCCESS,
      },
      { sub: 'device-1', type: PrincipalType.DISPLAY_DEVICE, classId: 'class-1' },
    ),
    (error: unknown) => error instanceof BusinessError && error.code === 'FORBIDDEN_CLASS_ACCESS',
  );
});

test('teacher telemetry requires an active relation to the target classroom', async () => {
  const service = new TelemetryService({
    classTeacher: { findFirst: async () => null },
  } as unknown as PrismaClient);
  await assert.rejects(
    service.record(
      {
        eventName: 'students.import',
        clientType: UsageClientType.ADMIN_WEB,
        classId: 'class-2',
      },
      { sub: 'teacher-1', type: PrincipalType.USER, sessionId: 'session-1' },
    ),
    (error: unknown) => error instanceof BusinessError && error.code === 'FORBIDDEN_CLASS_ACCESS',
  );
});
