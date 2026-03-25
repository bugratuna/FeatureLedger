import { config } from 'dotenv';
import { DataSource } from 'typeorm';

/**
 * TypeORM DataSource used by the migrations CLI (`migration:run`, `migration:generate`, etc.).
 *
 * This file is intentionally separate from the NestJS DatabaseModule because the CLI
 * runs outside the NestJS container and cannot use the DI-injected ConfigService.
 * We load .env directly via dotenv and construct the DataSource from raw env vars.
 *
 * synchronize is always false. Schema changes happen through committed migration files only.
 */
config(); // load .env for CLI usage

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'feature_ledger',

  // In development with ts-node, resolve .ts entity files; in production, use compiled .js
  entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],

  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  migrationsTableName: 'typeorm_migrations',
});
