
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';

export interface TestDatabase {
  dataSource: DataSource;
  container: StartedPostgreSqlContainer;
}

export async function setupTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('feature_ledger_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const dataSource = new DataSource({
    type: 'postgres',
    host: container.getHost(),
    port: container.getMappedPort(5432),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    entities: [__dirname + '/../../src/modules/**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../../src/database/migrations/*{.ts,.js}'],
    synchronize: false,
    logging: false,
    migrationsTableName: 'typeorm_migrations',
  });

  await dataSource.initialize();
  await dataSource.runMigrations();

  return { dataSource, container };
}

export async function teardownTestDatabase(db: TestDatabase): Promise<void> {
  await db.dataSource.destroy();
  await db.container.stop();
}

export async function clearDatabase(dataSource: DataSource): Promise<void> {
  const tables = [
    'subscription_addons',
    'subscriptions',
    'addon_features',
    'plan_features',
    'addons',
    'plans',
    'features',
    'memberships',
    'invitations',
    'organizations',
    'users',
  ];

  // Disable FK checks for the duration of the truncation
  await dataSource.query(`SET session_replication_role = 'replica'`);
  for (const table of tables) {
    await dataSource.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
  }
  await dataSource.query(`SET session_replication_role = 'origin'`);
}
