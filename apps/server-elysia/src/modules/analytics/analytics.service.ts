import { PrismaClient, UsageClientType, UsageEventResult } from '@prisma/client';
import { BusinessError } from '../../plugins/error-handler';
import { prisma } from '../../plugins/prisma';

const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;
const DISPLAY_ONLINE_WINDOW_MS = 90_000;

export interface AnalyticsRange {
  from: Date;
  to: Date;
}

interface AnalyticsEvent {
  eventName: string;
  clientType: UsageClientType;
  result: UsageEventResult;
  userId: string | null;
  deviceId: string | null;
  module: string | null;
  appVersion: string | null;
  occurredAt: Date;
}

export function parseAnalyticsRange(from?: string, to?: string, now = new Date()): AnalyticsRange {
  const end = to ? new Date(to) : now;
  const start = from ? new Date(from) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new BusinessError('ANALYTICS_RANGE_INVALID', '统计时间范围无效', 400);
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
    throw new BusinessError('ANALYTICS_RANGE_TOO_LARGE', '单次最多查询 90 天', 400);
  }
  return { from: start, to: end };
}

export function buildFeatureUsage(events: AnalyticsEvent[]) {
  const grouped = new Map<string, { usageCount: number; users: Set<string> }>();
  for (const event of events) {
    if (event.clientType === UsageClientType.DISPLAY || event.result === UsageEventResult.FAILURE) {
      continue;
    }
    const feature = event.module || event.eventName;
    const current = grouped.get(feature) ?? { usageCount: 0, users: new Set<string>() };
    current.usageCount += 1;
    if (event.userId) current.users.add(event.userId);
    grouped.set(feature, current);
  }
  return [...grouped.entries()]
    .map(([feature, value]) => ({
      feature,
      usageCount: value.usageCount,
      activeTeachers: value.users.size,
      activeClassrooms: 1,
    }))
    .sort(
      (left, right) =>
        right.usageCount - left.usageCount || left.feature.localeCompare(right.feature),
    );
}

export function buildDisplayUsage(events: AnalyticsEvent[]) {
  const displayEvents = events.filter((event) => event.clientType === UsageClientType.DISPLAY);
  const onlineEvents = displayEvents.filter(
    (event) =>
      event.result === UsageEventResult.SUCCESS &&
      ['display.started', 'display.heartbeat'].includes(event.eventName),
  );
  const activeDevices = new Set(
    onlineEvents.flatMap((event) => (event.deviceId ? [event.deviceId] : [])),
  );
  const minuteBuckets = new Set<string>();
  const dailyDevices = new Map<string, Set<string>>();
  const dailyMinutes = new Map<string, Set<string>>();

  for (const event of onlineEvents) {
    if (!event.deviceId) continue;
    const minute = event.occurredAt.toISOString().slice(0, 16);
    const day = minute.slice(0, 10);
    const bucket = `${event.deviceId}:${minute}`;
    minuteBuckets.add(bucket);
    const devices = dailyDevices.get(day) ?? new Set<string>();
    devices.add(event.deviceId);
    dailyDevices.set(day, devices);
    const minutes = dailyMinutes.get(day) ?? new Set<string>();
    minutes.add(bucket);
    dailyMinutes.set(day, minutes);
  }

  return {
    activeDevices: activeDevices.size,
    averageOnlineMinutes:
      activeDevices.size === 0
        ? 0
        : Math.round((minuteBuckets.size / activeDevices.size) * 10) / 10,
    realtimeConnectionErrors: displayEvents.filter(
      (event) => event.result === UsageEventResult.FAILURE && event.module === 'realtime',
    ).length,
    dailyTrend: [...dailyDevices.keys()].sort().map((date) => ({
      date,
      activeDevices: dailyDevices.get(date)?.size ?? 0,
      onlineMinutes: dailyMinutes.get(date)?.size ?? 0,
    })),
  };
}

export class AnalyticsService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getClassSummary(classId: string, userId: string, range: AnalyticsRange) {
    const access = await this.db.classTeacher.findFirst({
      where: { classId, teacherId: userId, status: 'ACTIVE', role: 'HEAD_TEACHER' },
      select: { id: true },
    });
    if (!access) {
      throw new BusinessError('FORBIDDEN_ROLE', '仅班主任可查看本班使用分析', 403);
    }

    const eventWhere = { classId, occurredAt: { gte: range.from, lt: range.to } };
    const onlineAfter = new Date(Date.now() - DISPLAY_ONLINE_WINDOW_MS);
    const [events, configuredDisplays, currentOnlineDisplays, feedbackGroups, feedbackTotal] =
      await Promise.all([
        this.db.usageEvent.findMany({
          where: eventWhere,
          select: {
            eventName: true,
            clientType: true,
            result: true,
            userId: true,
            deviceId: true,
            module: true,
            appVersion: true,
            occurredAt: true,
          },
          orderBy: { occurredAt: 'asc' },
        }),
        this.db.displayDevice.count({ where: { classId, status: 'ACTIVE' } }),
        this.db.displayDevice.count({
          where: { classId, status: 'ACTIVE', lastSeenAt: { gte: onlineAfter } },
        }),
        this.db.feedback.groupBy({
          by: ['status'],
          where: { classId, createdAt: { gte: range.from, lt: range.to } },
          _count: { _all: true },
        }),
        this.db.feedback.count({
          where: { classId, createdAt: { gte: range.from, lt: range.to } },
        }),
      ]);

    const activeTeachers = new Set(
      events.flatMap((event) =>
        event.clientType !== UsageClientType.DISPLAY && event.userId ? [event.userId] : [],
      ),
    ).size;
    const display = buildDisplayUsage(events);
    const feedbackByStatus = Object.fromEntries(
      feedbackGroups.map((group) => [group.status, group._count._all]),
    );
    const versions = new Map<string, Set<string>>();
    for (const event of events) {
      if (!event.appVersion) continue;
      const identities = versions.get(event.appVersion) ?? new Set<string>();
      const identity = event.deviceId || event.userId;
      if (identity) identities.add(identity);
      versions.set(event.appVersion, identities);
    }

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      activeClassrooms: events.length > 0 ? 1 : 0,
      activeTeachers,
      eventCount: events.length,
      errorCount: events.filter((event) => event.result === UsageEventResult.FAILURE).length,
      displays: {
        configured: configuredDisplays,
        currentlyOnline: currentOnlineDisplays,
        ...display,
      },
      featureUsage: buildFeatureUsage(events),
      feedback: {
        total: feedbackTotal,
        new: feedbackByStatus.PENDING ?? 0,
        pending: (feedbackByStatus.PENDING ?? 0) + (feedbackByStatus.IN_PROGRESS ?? 0),
        resolved: feedbackByStatus.RESOLVED ?? 0,
        closed: feedbackByStatus.CLOSED ?? 0,
      },
      versions: [...versions.entries()]
        .map(([version, identities]) => ({ version, activeClients: identities.size }))
        .sort((left, right) => right.activeClients - left.activeClients),
    };
  }
}

export const analyticsService = new AnalyticsService();
