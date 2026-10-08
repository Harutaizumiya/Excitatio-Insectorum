import dotenv from 'dotenv';
import { resolve } from 'node:path';

// Load environment files from the active package or workspace root. The
// workspace root is the default pnpm start directory.
const envPaths = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'apps/server-elysia/.env'),
  resolve(process.cwd(), '../server-elysia/.env'),
  resolve(process.cwd(), '../../apps/server-elysia/.env'),
  resolve(process.cwd(), '../../.env'),
];

for (const envPath of [...new Set(envPaths)]) {
  dotenv.config({ path: envPath });
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  publicWebOrigin: string;
  jwtAccessSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshSecret: string;
  invitationExpiresIn: string;
  deviceAccessExpiresIn: string;
  deviceBindingSecret: string;
  wechatEnabled: boolean;
  wechatAppId: string;
  wechatAppSecret: string;
  wechatRequestTimeoutMs: number;
  wechatBindingTicketExpiresInSeconds: number;
  wechatMiniProgramEnvVersion: 'develop' | 'trial' | 'release';
  corsOrigins: string[];
  swaggerEnabled: boolean;
  scoreSettlementCron: string;
  seatRotationCron: string;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const wechatEnabled = process.env.WECHAT_ENABLED === 'true';
const wechatAppId = process.env.WECHAT_APP_ID?.trim() || '';
const wechatAppSecret = process.env.WECHAT_APP_SECRET?.trim() || '';
const wechatMiniProgramEnvVersion = ['develop', 'trial', 'release'].includes(
  process.env.WECHAT_MINIPROGRAM_ENV_VERSION || 'release',
)
  ? ((process.env.WECHAT_MINIPROGRAM_ENV_VERSION || 'release') as 'develop' | 'trial' | 'release')
  : 'release';

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function requiredProductionValue(name: string, fallback: string): string {
  const value = process.env[name] || fallback;
  if (isProduction && (!process.env[name] || value.startsWith('replace-with-'))) {
    throw new Error(`${name} must be configured in production`);
  }
  return value;
}

function resolvePublicWebOrigin(): string {
  const configuredOrigin =
    process.env.PUBLIC_WEB_ORIGIN?.trim() ||
    process.env.CORS_ORIGIN?.split(',')
      .map((origin) => origin.trim())
      .find(Boolean) ||
    'http://localhost:3001';

  let origin: URL;
  try {
    origin = new URL(configuredOrigin);
  } catch {
    throw new Error('PUBLIC_WEB_ORIGIN must be a valid HTTP(S) origin');
  }

  if (!['http:', 'https:'].includes(origin.protocol)) {
    throw new Error('PUBLIC_WEB_ORIGIN must be a valid HTTP(S) origin');
  }

  return origin.origin;
}

if (isProduction && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be configured in production');
}
if (isProduction && !process.env.REDIS_URL) {
  throw new Error('REDIS_URL must be configured in production');
}
if (isProduction && !process.env.CORS_ORIGIN) {
  throw new Error('CORS_ORIGIN must be configured in production');
}
if (wechatEnabled && isProduction && (!wechatAppId || !wechatAppSecret)) {
  throw new Error(
    'WECHAT_APP_ID and WECHAT_APP_SECRET must be configured when WECHAT_ENABLED=true',
  );
}

export const config: AppConfig = {
  port: Number(process.env.PORT || 3000),
  nodeEnv,
  publicWebOrigin: resolvePublicWebOrigin(),
  jwtAccessSecret: requiredProductionValue(
    'JWT_ACCESS_SECRET',
    'replace-with-at-least-32-random-characters-for-access',
  ),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshSecret: requiredProductionValue(
    'JWT_REFRESH_SECRET',
    'replace-with-at-least-32-random-characters-for-refresh',
  ),
  invitationExpiresIn: process.env.INVITATION_EXPIRES_IN || '24h',
  deviceAccessExpiresIn: process.env.DEVICE_ACCESS_EXPIRES_IN || '30m',
  deviceBindingSecret: requiredProductionValue(
    'DEVICE_BINDING_ENCRYPTION_SECRET',
    'replace-with-a-third-32-character-random-secret',
  ),
  wechatEnabled,
  wechatAppId,
  wechatAppSecret,
  wechatRequestTimeoutMs: positiveInteger('WECHAT_REQUEST_TIMEOUT_MS', 5000),
  wechatBindingTicketExpiresInSeconds: positiveInteger('WECHAT_BINDING_TICKET_TTL_SECONDS', 300),
  wechatMiniProgramEnvVersion,
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3001,http://localhost:3002')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
  scoreSettlementCron: process.env.SCORE_SETTLEMENT_CRON || '0 0 1 * *',
  seatRotationCron: process.env.SEAT_ROTATION_CRON || '5 0 * * 1',
};
