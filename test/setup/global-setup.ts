/**
 * Global setup for E2E tests.
 * Runs once before all test suites — starts any shared test infrastructure.
 *
 * At this stage we rely on the test Postgres instance from docker-compose.
 * Future: could spin up a fresh container via testcontainers-node.
 */
export default async function globalSetup() {
  // Ensure test env vars are set
  process.env.NODE_ENV = 'test';
  process.env.DB_NAME = process.env.DB_NAME ? `${process.env.DB_NAME}_test` : 'feature_ledger_test';
  process.env.DB_PORT = process.env.DB_PORT_TEST ?? '5433';
}
