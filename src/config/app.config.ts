import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  throttle: {
    authLimit: parseInt(process.env.THROTTLE_AUTH_LIMIT ?? '20', 10),
    authTtlMs: parseInt(process.env.THROTTLE_AUTH_TTL_MS ?? '60000', 10),
  },
}));

export const jwtConfig = registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET,
  accessExpiry: process.env.JWT_ACCESS_EXPIRY ?? '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '30d',
}));

export const webhookConfig = registerAs('webhook', () => ({
  signingSecret: process.env.WEBHOOK_SIGNING_SECRET,
}));
