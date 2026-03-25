import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Hand logging over to pino immediately — suppress NestJS default logger during bootstrap
    bufferLogs: true,
  });

  // Swap NestJS logger for pino after app is created
  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') ?? 3000;
  const isProduction = config.get<boolean>('app.isProduction') ?? false;

  // Security headers
  app.use(
    helmet({
      // Allow Swagger UI to load inline scripts in development
      contentSecurityPolicy: isProduction ? undefined : false,
    }),
  );

  // CORS — allowlist in production, permissive in development
  const corsOrigin = config.get<string>('app.corsOrigin') ?? '*';
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    credentials: true,
  });

  // Global route prefix and versioning
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validation — reject unknown fields, transform primitives, enforce all decorators
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Global exception filter — normalises all errors into the standard envelope
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response interceptor — wraps successful responses in the standard envelope
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Swagger — only expose in non-production environments
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('FeatureLedger API')
      .setDescription(
        'Multi-tenant entitlement and usage metering service. ' +
          'Centralizes subscription plans, feature access, seat limits, usage quotas, ' +
          'and audit-ready access decisions.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'api-key')
      .addTag('Auth', 'Authentication and session management')
      .addTag('Organizations', 'Tenant management and membership')
      .addTag('Catalog', 'Plans, features, and add-ons')
      .addTag('Subscriptions', 'Subscription lifecycle and entitlements')
      .addTag('Access', 'Entitlement checks and simulations')
      .addTag('Usage', 'Usage event ingestion and metering')
      .addTag('API Keys', 'Machine-to-machine authentication')
      .addTag('Webhooks', 'Outbound event delivery')
      .addTag('Audit', 'Immutable audit log')
      .addTag('Health', 'Liveness and readiness probes')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });

    logger.log(`Swagger UI available at http://localhost:${port}/docs`);
  }

  await app.listen(port);
  logger.log(`FeatureLedger listening on port ${port} [${config.get('app.nodeEnv')}]`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap', err);
  process.exit(1);
});
