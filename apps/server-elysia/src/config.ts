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
  corsOrigins: string[];
  swaggerEnabled: boolean;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

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
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3001,http://localhost:3002')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
};
