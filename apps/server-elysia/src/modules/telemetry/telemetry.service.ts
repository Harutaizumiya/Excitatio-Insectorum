import { randomUUID } from 'node:crypto';
import {
  Prisma,
  PrismaClient,
  UsageClientType,
  UsageEventResult,
  type TeacherRole,
} from '@prisma/client';
import { BusinessError } from '../../plugins/error-handler';
import { prisma } from '../../plugins/prisma';
import { PrincipalType, type AccessTokenClaims } from '../../plugins/auth';

const ALLOWED_PROPERTY_KEYS = new Set([
  'totalCount',
  'successCount',
  'failureCount',
  'operationMode',
  'reconnectCount',
  'durationMs',
  'errorCode',
  'feature',
  'itemCount',
]);

export type EventPropertyValue = string | number | boolean;

export interface RecordUsageEventInput {
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
  properties?: Record<string, EventPropertyValue>;
  occurredAt?: string;
}

export function sanitizeEventProperties(
  properties?: Record<string, EventPropertyValue>,
): Prisma.InputJsonObject | undefined {
  if (!properties) return undefined;
  const entries = Object.entries(properties);
  if (entries.length > 12) {
    throw new BusinessError('TELEMETRY_PROPERTIES_INVALID', '事件扩展属性最多 12 项', 400);
  }

  const sanitized: Record<string, EventPropertyValue> = {};
  for (const [key, value] of entries) {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) {
      throw new BusinessError(
        'TELEMETRY_PROPERTY_NOT_ALLOWED',
        `事件扩展属性 ${key} 不在允许范围内`,
        400,
      );
    }
    if (
      !['string', 'number', 'boolean'].includes(typeof value) ||
      (typeof value === 'number' && !Number.isFinite(value)) ||
      (typeof value === 'string' && value.length > 100)
    ) {
      throw new BusinessError('TELEMETRY_PROPERTIES_INVALID', '事件扩展属性格式无效', 400);
    }
    sanitized[key] = value;
  }
  return sanitized as Prisma.InputJsonObject;
}

export function normalizePage(page?: string): string | undefined {
  return page?.split(/[?#]/, 1)[0] || undefined;
}

export class TelemetryService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async record(input: RecordUsageEventInput, principal: AccessTokenClaims) {
    const traceId = input.traceId || randomUUID();
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BusinessError('TELEMETRY_OCCURRED_AT_INVALID', '事件时间无效', 400);
    }

    let classId: string;
    let userId: string | null = null;
    let deviceId: string | null = null;
    let userRole: TeacherRole | null = null;

    if (principal.type === PrincipalType.DISPLAY_DEVICE) {
      if (input.clientType !== UsageClientType.DISPLAY) {
        throw new BusinessError('TELEMETRY_CLIENT_MISMATCH', '大屏凭证只能上报大屏事件', 403);
      }
      if (input.classId && input.classId !== principal.classId) {
        throw new BusinessError('FORBIDDEN_CLASS_ACCESS', '无权向其他班级上报事件', 403);
      }
      classId = principal.classId;
      deviceId = principal.sub;
    } else {
      if (input.clientType === UsageClientType.DISPLAY) {
        throw new BusinessError('TELEMETRY_CLIENT_MISMATCH', '用户凭证不能上报大屏事件', 403);
      }
      if (!input.classId) {
        throw new BusinessError('TELEMETRY_CLASS_REQUIRED', '教师事件必须指定班级', 400);
      }
      const access = await this.db.classTeacher.findFirst({
        where: { classId: input.classId, teacherId: principal.sub, status: 'ACTIVE' },
        select: { role: true },
      });
      if (!access) {
        throw new BusinessError('FORBIDDEN_CLASS_ACCESS', '无权向该班级上报事件', 403);
      }
      classId = input.classId;
      userId = principal.sub;
      userRole = access.role;
    }

    const data: Prisma.UsageEventCreateInput = {
      eventName: input.eventName,
      clientType: input.clientType,
      result: input.result ?? UsageEventResult.SUCCESS,
      classroom: { connect: { id: classId } },
      user: userId ? { connect: { id: userId } } : undefined,
      device: deviceId ? { connect: { id: deviceId } } : undefined,
      userRole,
      module: input.module,
      page: normalizePage(input.page),
      appVersion: input.appVersion,
      browser: input.browser,
      traceId,
      errorCode: input.errorCode,
      properties: sanitizeEventProperties(input.properties),
      occurredAt,
    };

    const event = await this.db.$transaction(async (tx) => {
      const created = await tx.usageEvent.create({ data, select: { id: true } });
      if (deviceId) {
        await tx.displayDevice.updateMany({
          where: { id: deviceId, classId, status: 'ACTIVE' },
          data: { lastSeenAt: new Date() },
        });
      }
      return created;
    });

    return { id: event.id, traceId };
  }
}

export const telemetryService = new TelemetryService();
