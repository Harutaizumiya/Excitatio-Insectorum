import dotenv from 'dotenv';
import { resolve } from 'node:path';

// Load .env file from local directory, server directory, or root
dotenv.config();
dotenv.config({ path: resolve(process.cwd(), '../server/.env') });
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwtAccessSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshSecret: string;
  invitationExpiresIn: string;
  deviceAccessExpiresIn: string;
  deviceBindingSecret: string;
  corsOrigins: string[];
  swaggerEnabled: boolean;
}

export const config: AppConfig = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtAccessSecret:
    process.env.JWT_ACCESS_SECRET || 'replace-with-at-least-32-random-characters-for-access',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET || 'replace-with-at-least-32-random-characters-for-refresh',
  invitationExpiresIn: process.env.INVITATION_EXPIRES_IN || '24h',
  deviceAccessExpiresIn: process.env.DEVICE_ACCESS_EXPIRES_IN || '30m',
  deviceBindingSecret:
    process.env.DEVICE_BINDING_ENCRYPTION_SECRET || 'replace-with-a-third-32-character-random-secret',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3001,http://localhost:3002')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
};
