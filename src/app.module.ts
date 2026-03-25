import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { appConfig, jwtConfig, webhookConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Config is global — all modules can inject ConfigService without re-importing ConfigModule
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, webhookConfig, databaseConfig],
      validate: validateEnv,
    }),

    // Structured JSON logging via pino. pino-pretty for development, raw JSON in production.
    // We disable auto request logging here and rely on our own middleware for requestId
    // propagation, which gives us cleaner control over what gets logged per request.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        // Redact sensitive fields from request/response logs
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers["x-api-key"]',
            'req.body.password',
            'req.body.refreshToken',
          ],
          censor: '[REDACTED]',
        },
        // Don't log successful health checks — they're high-frequency and low-value
        autoLogging: {
          ignore: (req) => req.url?.includes('/health') ?? false,
        },
        serializers: {
          req(req) {
            return {
              id: req.id,
              method: req.method,
              url: req.url,
            };
          },
        },
      },
    }),

    // Basic throttling module — specific limits applied per-route with @Throttle()
    // Rate-limit storage defaults to in-memory; swap for Redis in production multi-instance deployments
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 200,
      },
    ]),

    DatabaseModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
