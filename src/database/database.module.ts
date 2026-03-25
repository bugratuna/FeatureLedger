import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

/**
 * Configures the TypeORM connection from NestJS ConfigService.
 *
 * Key decisions:
 * - synchronize: false — always. Schema changes go through migrations.
 * - autoLoadEntities: true — modules register their entities via TypeOrmModule.forFeature()
 *   and TypeORM picks them up automatically. No manual entity list to maintain here.
 * - logging in development gives query visibility; production only logs errors.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        autoLoadEntities: true,
        synchronize: false,
        logging:
          config.get<string>('app.nodeEnv') === 'development' ? ['query', 'error'] : ['error'],
        migrationsTableName: 'typeorm_migrations',
      }),
    }),
  ],
})
export class DatabaseModule {}
