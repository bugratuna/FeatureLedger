import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates entitlement tables: organization_feature_overrides and organization_entitlements.
 *
 * Notes:
 * - organization_feature_overrides: one row per (organization, feature). A row represents the
 *   current manual override for that feature within that org. To change it, UPDATE in place.
 *   startsAt/endsAt allow time-windowed overrides (e.g., a 30-day trial grant).
 * - organization_entitlements: precomputed snapshot, one row per (organization, feature).
 *   Rebuilt on recalculation. Denormalized fields (feature_code, feature_name, meter_type)
 *   allow O(1) access-check lookups without joining to the features table.
 * - Both reference features with ON DELETE RESTRICT to prevent silent data loss if a
 *   feature is removed while overrides or snapshots reference it.
 */
export class EntitlementTables1700000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enum types ──────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TYPE entitlement_source_type_enum AS ENUM ('plan', 'addon', 'override', 'mixed')
    `);

    // ── organization_feature_overrides ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE organization_feature_overrides (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id  UUID NOT NULL,
        feature_id       UUID NOT NULL,
        is_enabled       BOOLEAN NOT NULL,
        limit_override   INTEGER,
        override_reason  VARCHAR(500),
        starts_at        TIMESTAMPTZ,
        ends_at          TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_override_feature
          FOREIGN KEY (feature_id) REFERENCES features (id) ON DELETE RESTRICT,

        CONSTRAINT uq_override_org_feature
          UNIQUE (organization_id, feature_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_override_org_id ON organization_feature_overrides (organization_id)
    `);

    // ── organization_entitlements ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE organization_entitlements (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id      UUID NOT NULL,
        feature_id           UUID NOT NULL,
        feature_code         VARCHAR(100) NOT NULL,
        feature_name         VARCHAR(255) NOT NULL,
        meter_type           meter_type_enum NOT NULL,
        source_type          entitlement_source_type_enum NOT NULL,
        is_enabled           BOOLEAN NOT NULL,
        effective_limit      INTEGER,
        overage_policy       overage_policy_enum NOT NULL,
        billing_period_start TIMESTAMPTZ,
        billing_period_end   TIMESTAMPTZ,
        recalculated_at      TIMESTAMPTZ NOT NULL,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_entitlement_feature
          FOREIGN KEY (feature_id) REFERENCES features (id) ON DELETE RESTRICT,

        CONSTRAINT uq_entitlement_org_feature
          UNIQUE (organization_id, feature_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_entitlement_org_id ON organization_entitlements (organization_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS organization_entitlements`);
    await queryRunner.query(`DROP TABLE IF EXISTS organization_feature_overrides`);
    await queryRunner.query(`DROP TYPE IF EXISTS entitlement_source_type_enum`);
  }
}
