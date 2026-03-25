import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the product catalog tables: features, plans, plan_features, addons, addon_features.
 *
 * Design notes:
 * - No organization_id: the catalog is global/platform-owned, not tenant-scoped.
 * - plan_features and addon_features are rich join tables (carry entitlement config),
 *   not simple pivots, so they have their own UUID primary key.
 * - ON DELETE RESTRICT on feature_id prevents orphaning active entitlement data
 *   by removing a feature that plans depend on.
 * - ON DELETE CASCADE on plan_id/addon_id: removing a plan removes its feature mappings.
 */
export class CatalogTables1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enum types ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE meter_type_enum AS ENUM ('boolean', 'quantity', 'seats', 'storage', 'usage')
    `);

    await queryRunner.query(`
      CREATE TYPE overage_policy_enum AS ENUM ('deny', 'soft_limit', 'allow_and_flag')
    `);

    // ── features ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE features (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code        VARCHAR(100) NOT NULL,
        name        VARCHAR(255) NOT NULL,
        unit_label  VARCHAR(100),
        meter_type  meter_type_enum NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_feature_code UNIQUE (code)
      )
    `);

    // ── plans ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE plans (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(255) NOT NULL,
        slug        VARCHAR(100) NOT NULL,
        description TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_plan_slug UNIQUE (slug)
      )
    `);

    // ── plan_features ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE plan_features (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_id         UUID NOT NULL,
        feature_id      UUID NOT NULL,
        included_limit  INTEGER,
        overage_policy  overage_policy_enum NOT NULL DEFAULT 'deny',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_plan_feature         UNIQUE (plan_id, feature_id),
        CONSTRAINT fk_plan_features_plan   FOREIGN KEY (plan_id)    REFERENCES plans(id)    ON DELETE CASCADE,
        CONSTRAINT fk_plan_features_feat   FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_plan_features_plan_id ON plan_features (plan_id)
    `);

    // ── addons ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE addons (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(255) NOT NULL,
        slug        VARCHAR(100) NOT NULL,
        description TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_addon_slug UNIQUE (slug)
      )
    `);

    // ── addon_features ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE addon_features (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        addon_id        UUID NOT NULL,
        feature_id      UUID NOT NULL,
        included_limit  INTEGER,
        overage_policy  overage_policy_enum NOT NULL DEFAULT 'deny',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_addon_feature          UNIQUE (addon_id, feature_id),
        CONSTRAINT fk_addon_features_addon   FOREIGN KEY (addon_id)   REFERENCES addons(id)    ON DELETE CASCADE,
        CONSTRAINT fk_addon_features_feat    FOREIGN KEY (feature_id) REFERENCES features(id)  ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_addon_features_addon_id ON addon_features (addon_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS addon_features`);
    await queryRunner.query(`DROP TABLE IF EXISTS addons`);
    await queryRunner.query(`DROP TABLE IF EXISTS plan_features`);
    await queryRunner.query(`DROP TABLE IF EXISTS plans`);
    await queryRunner.query(`DROP TABLE IF EXISTS features`);
    await queryRunner.query(`DROP TYPE IF EXISTS overage_policy_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS meter_type_enum`);
  }
}
