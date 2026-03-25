import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema migration: identity, tenancy, and authentication tables.
 *
 * Creates:
 *   users           — platform user accounts
 *   organizations   — tenant entities
 *   memberships     — user-to-org relationships with roles
 *   invitations     — pending org invitations (tokenized, expiring)
 *   refresh_tokens  — persistent refresh token records with family tracking
 *
 * Design notes:
 *   - All PKs are UUID v4 (gen_random_uuid()) — no sequential IDs that leak row count
 *   - refresh_tokens stores SHA-256 hashes only; raw tokens are never stored
 *   - Membership unique constraint prevents duplicate org membership at the DB level
 *   - Partial indexes on refresh_tokens for efficient active-token lookups
 *   - All timestamps are TIMESTAMPTZ — timezone-aware from day 1
 */
export class InitialAuthAndTenancy1700000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id                UUID         NOT NULL DEFAULT gen_random_uuid(),
        email             VARCHAR(320) NOT NULL,
        display_name      VARCHAR(255) NOT NULL,
        password_hash     VARCHAR(255) NOT NULL,
        is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
        is_platform_admin BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_users PRIMARY KEY (id),
        CONSTRAINT uq_users_email UNIQUE (email)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_users_email ON users (email)
    `);

    await queryRunner.query(`
      CREATE TABLE organizations (
        id         UUID         NOT NULL DEFAULT gen_random_uuid(),
        name       VARCHAR(255) NOT NULL,
        slug       VARCHAR(100) NOT NULL,
        is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_organizations PRIMARY KEY (id),
        CONSTRAINT uq_organizations_slug UNIQUE (slug)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_organizations_slug ON organizations (slug)
    `);

    await queryRunner.query(`
      CREATE TABLE memberships (
        id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
        organization_id     UUID        NOT NULL,
        user_id             UUID        NOT NULL,
        role                VARCHAR(50) NOT NULL,
        invited_by_user_id  UUID,
        joined_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_memberships PRIMARY KEY (id),
        CONSTRAINT uq_membership_org_user UNIQUE (organization_id, user_id),
        CONSTRAINT fk_memberships_organization
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
        CONSTRAINT fk_memberships_user
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_memberships_invited_by
          FOREIGN KEY (invited_by_user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_memberships_organization_id ON memberships (organization_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_memberships_user_id ON memberships (user_id)
    `);

    await queryRunner.query(`
      CREATE TABLE invitations (
        id                   UUID         NOT NULL DEFAULT gen_random_uuid(),
        organization_id      UUID         NOT NULL,
        email                VARCHAR(320) NOT NULL,
        role                 VARCHAR(50)  NOT NULL,
        token_hash           CHAR(64)     NOT NULL,
        invited_by_user_id   UUID         NOT NULL,
        expires_at           TIMESTAMPTZ  NOT NULL,
        accepted_at          TIMESTAMPTZ,
        created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_invitations PRIMARY KEY (id),
        CONSTRAINT uq_invitations_token_hash UNIQUE (token_hash),
        CONSTRAINT fk_invitations_organization
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
        CONSTRAINT fk_invitations_invited_by
          FOREIGN KEY (invited_by_user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    /* Partial index: only pending invitations. Accepted ones are archived — not queried this way. */
    await queryRunner.query(`
      CREATE INDEX idx_invitations_org_email
        ON invitations (organization_id, email)
        WHERE accepted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id              UUID        NOT NULL DEFAULT gen_random_uuid(),
        user_id         UUID        NOT NULL,
        token_hash      CHAR(64)    NOT NULL,
        family          UUID        NOT NULL,
        is_revoked      BOOLEAN     NOT NULL DEFAULT FALSE,
        expires_at      TIMESTAMPTZ NOT NULL,
        replaced_by_id  UUID,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_refresh_tokens PRIMARY KEY (id),
        CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash),
        CONSTRAINT fk_refresh_tokens_user
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    /* Hash lookup — the most frequent operation, happens on every refresh request */
    await queryRunner.query(`
      CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens (token_hash)
    `);

    /* Family revocation: find all active tokens in a family to mark them revoked */
    await queryRunner.query(`
      CREATE INDEX idx_refresh_tokens_family ON refresh_tokens (family)
        WHERE is_revoked = FALSE
    `);

    /* Per-user active session listing — for a future session management endpoint */
    await queryRunner.query(`
      CREATE INDEX idx_refresh_tokens_user_active
        ON refresh_tokens (user_id, expires_at DESC)
        WHERE is_revoked = FALSE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS invitations`);
    await queryRunner.query(`DROP TABLE IF EXISTS memberships`);
    await queryRunner.query(`DROP TABLE IF EXISTS organizations`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
