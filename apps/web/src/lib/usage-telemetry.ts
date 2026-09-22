import type {
  ReportUsageEventOptions,
  UsageEventInput,
  UsageEventProperties,
  UsageEventResponse,
} from './domain';

export const TELEMETRY_PROPERTY_KEYS = [
  'totalCount',
  'successCount',
  'failureCount',
  'operationMode',
  'reconnectCount',
  'durationMs',
  'errorCode',
  'feature',
  'itemCount',
] as const;

export function createTraceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function sanitizeUsageEventProperties(
  properties?: UsageEventProperties,
): UsageEventProperties | undefined {
  if (!properties) return undefined;

  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if ((TELEMETRY_PROPERTY_KEYS as readonly string[]).includes(key)) {
      sanitized[key] = value;
    }
  }
  return Object.keys(sanitized).length > 0 ? (sanitized as UsageEventProperties) : undefined;
}

export type UsageEventReporter = (
  input: UsageEventInput,
  options?: ReportUsageEventOptions,
) => Promise<UsageEventResponse>;

export interface BestEffortUsageEventResult {
  success: boolean;
  traceId: string;
  eventId?: string;
}

export async function reportUsageEventBestEffort(
  reporter: UsageEventReporter,
  input: UsageEventInput,
  options?: ReportUsageEventOptions,
): Promise<BestEffortUsageEventResult> {
  const traceId = input.traceId || createTraceId();
  try {
    const result = await reporter(
      {
        ...input,
        traceId,
        properties: sanitizeUsageEventProperties(input.properties),
      },
      options,
    );
    return { success: true, traceId: result.traceId || traceId, eventId: result.id };
  } catch {
    return { success: false, traceId };
  }
}
