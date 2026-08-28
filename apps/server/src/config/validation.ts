import Joi from 'joi';

const durationPattern = /^\d+(ms|s|m|h|d)$/;

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().pattern(durationPattern).default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  INVITATION_EXPIRES_IN: Joi.string().pattern(durationPattern).default('24h'),
  DEVICE_ACCESS_EXPIRES_IN: Joi.string().pattern(durationPattern).default('30m'),
  DEVICE_BINDING_ENCRYPTION_SECRET: Joi.string().min(32).required(),
  CORS_ORIGIN: Joi.string().min(1).required(),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
}).unknown(true);
