import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates subscription tables: subscriptions and subscription_addons.
 *
 * Notes:
 * - Each subscription belongs to one organization and one plan.
 * - A partial unique index on (organization_id) WHERE status IN ('trialing','active')
 *   prevents more than one active subscription per org at the DB level.
 * - subscription_addons rows are deleted automatically when their parent
 *   subscription is deleted (CASCADE). Deleting an addon is blocked if any
 *   subscription currently uses it (RESTRICT).
 * - The version column is used for optimistic locking (TypeORM @VersionColumn).
 */
export class SubscriptionTables1700000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enum type ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE subscription_status_enum AS ENUM ('trialing', 'active', 'past_due', 'canceled')
    `);

    // ── subscriptions ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE subscriptions (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id      UUID NOT NULL,
        plan_id              UUID NOT NULL,
        status               subscription_status_enum NOT NULL,
        billing_period_start TIMESTAMPTZ NOT NULL,
        billing_period_end   TIMESTAMPTZ NOT NULL,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
        canceled_at          TIMESTAMPTZ,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        version              INTEGER NOT NULL DEFAULT 1,

        CONSTRAINT fk_subscription_organization
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,

        CONSTRAINT fk_subscription_plan
          FOREIGN KEY (plan_id) REFERENCES plans (id) ON DELETE RESTRICT
      )
    `);

    // Composite index for the common lookup: find the active subscription for an org
    await queryRunner.query(`
      CREATE INDEX idx_subscriptions_org_status
        ON subscriptions (organization_id, status)
    `);

    // Partial unique index: only one active/trialing subscription per org is allowed
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_subscription_org_active
        ON subscriptions (organization_id)
        WHERE status IN ('trialing', 'active')
    `);

    // ── subscription_addons ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE subscription_addons (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subscription_id UUID NOT NULL,
        addon_id        UUID NOT NULL,
        quantity        INTEGER NOT NULL DEFAULT 1,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_subscription_addon_subscription
          FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON DELETE CASCADE,

        CONSTRAINT fk_subscription_addon_addon
          FOREIGN KEY (addon_id) REFERENCES addons (id) ON DELETE RESTRICT,

        CONSTRAINT uq_subscription_addon UNIQUE (subscription_id, addon_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS subscription_addons`);
    await queryRunner.query(`DROP TABLE IF EXISTS subscriptions`);
    await queryRunner.query(`DROP TYPE IF EXISTS subscription_status_enum`);
  }
}
