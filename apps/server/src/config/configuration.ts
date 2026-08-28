export interface ApplicationConfiguration {
  app: {
    nodeEnv: string;
    port: number;
    corsOrigin: string;
    swaggerEnabled: boolean;
  };
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    invitationExpiresIn: string;
    deviceAccessExpiresIn: string;
  };
  logging: {
    level: string;
  };
  security: {
    deviceBindingSecret: string;
  };
}

export default (): ApplicationConfiguration => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number.parseInt(process.env.PORT ?? '3000', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? '',
    swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  redis: {
    url: process.env.REDIS_URL ?? '',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    invitationExpiresIn: process.env.INVITATION_EXPIRES_IN ?? '24h',
    deviceAccessExpiresIn: process.env.DEVICE_ACCESS_EXPIRES_IN ?? '30m',
  },
  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  security: {
    deviceBindingSecret: process.env.DEVICE_BINDING_ENCRYPTION_SECRET ?? '',
  },
});
