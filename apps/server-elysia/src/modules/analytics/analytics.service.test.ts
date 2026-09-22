import assert from 'node:assert/strict';
import test from 'node:test';
import { UsageClientType, UsageEventResult } from '@prisma/client';
import { BusinessError } from '../../plugins/error-handler';
import { buildDisplayUsage, buildFeatureUsage, parseAnalyticsRange } from './analytics.service';

const at = (value: string) => new Date(value);

test('analytics range defaults to seven days and rejects ranges over ninety days', () => {
  const now = at('2026-09-11T12:00:00.000Z');
  const range = parseAnalyticsRange(undefined, undefined, now);
  assert.equal(range.to.toISOString(), now.toISOString());
  assert.equal(range.from.toISOString(), '2026-09-04T12:00:00.000Z');
  assert.throws(
    () => parseAnalyticsRange('2026-01-01T00:00:00.000Z', '2026-09-11T00:00:00.000Z'),
    (error: unknown) =>
      error instanceof BusinessError && error.code === 'ANALYTICS_RANGE_TOO_LARGE',
  );
});

test('feature usage excludes display and failed events', () => {
  const events = [
    {
      eventName: 'scores.create',
      module: 'scores',
      clientType: UsageClientType.ADMIN_WEB,
      result: UsageEventResult.SUCCESS,
      userId: 'teacher-1',
      deviceId: null,
      appVersion: '1.0.0',
      occurredAt: at('2026-09-11T01:00:00.000Z'),
    },
    {
      eventName: 'scores.create',
      module: 'scores',
      clientType: UsageClientType.ADMIN_WEB,
      result: UsageEventResult.FAILURE,
      userId: 'teacher-1',
      deviceId: null,
      appVersion: '1.0.0',
      occurredAt: at('2026-09-11T01:01:00.000Z'),
    },
  ];
  assert.deepEqual(buildFeatureUsage(events), [
    { feature: 'scores', usageCount: 1, activeTeachers: 1, activeClassrooms: 1 },
  ]);
});

test('display online duration deduplicates events in the same device minute', () => {
  const base = {
    eventName: 'display.heartbeat',
    module: 'runtime',
    clientType: UsageClientType.DISPLAY,
    result: UsageEventResult.SUCCESS,
    userId: null,
    deviceId: 'display-1',
    appVersion: '1.0.0',
  };
  const usage = buildDisplayUsage([
    { ...base, occurredAt: at('2026-09-11T01:00:01.000Z') },
    { ...base, occurredAt: at('2026-09-11T01:00:45.000Z') },
    { ...base, occurredAt: at('2026-09-11T01:01:01.000Z') },
  ]);
  assert.equal(usage.activeDevices, 1);
  assert.equal(usage.averageOnlineMinutes, 2);
  assert.deepEqual(usage.dailyTrend, [{ date: '2026-09-11', activeDevices: 1, onlineMinutes: 2 }]);
});

test('display failures do not count as online minutes', () => {
  const usage = buildDisplayUsage([
    {
      eventName: 'display.load_failed',
      module: 'display',
      clientType: UsageClientType.DISPLAY,
      result: UsageEventResult.FAILURE,
      userId: null,
      deviceId: 'display-1',
      appVersion: '1.0.0',
      occurredAt: at('2026-09-11T01:00:01.000Z'),
    },
  ]);
  assert.equal(usage.activeDevices, 0);
  assert.equal(usage.averageOnlineMinutes, 0);
  assert.deepEqual(usage.dailyTrend, []);
});
