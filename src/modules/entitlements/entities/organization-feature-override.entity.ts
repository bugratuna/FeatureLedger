import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { Feature } from '../../catalog/entities/feature.entity';

/**
 * A manual, org-scoped override that adjusts feature access independently of
 * the org's subscription plan and addons.
 *
 * Use cases:
 * - Granting trial access to a premium feature for a specific org
 * - Disabling a feature for a specific org despite it being on their plan
 * - Setting a custom limit that differs from the plan definition
 *
 * Design notes:
 * - One active row per (organizationId, featureId). Update the row to change the override.
 * - startsAt/endsAt create time-windowed overrides. NULL means no boundary.
 *   An override is "active" when NOW() falls within [startsAt, endsAt).
 * - The override is excluded from the entitlement snapshot when it is inactive (outside window).
 */
@Entity('organization_feature_overrides')
@Unique('uq_override_org_feature', ['organizationId', 'featureId'])
@Index('idx_override_org_id', ['organizationId'])
export class OrganizationFeatureOverride {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'feature_id', type: 'uuid' })
  featureId!: string;

  /**
   * True: force-enable the feature for this org regardless of plan/addons.
   * False: force-disable the feature for this org regardless of plan/addons.
   */
  @Column({ name: 'is_enabled', type: 'boolean' })
  isEnabled!: boolean;

  /**
   * If set, replaces the computed effective limit entirely.
   * NULL means "use the computed limit" (when isEnabled=true) or "no limit" as appropriate.
   */
  @Column({ name: 'limit_override', type: 'integer', nullable: true })
  limitOverride!: number | null;

  /** Short description for audit trail — why was this override created? */
  @Column({ name: 'override_reason', type: 'varchar', length: 500, nullable: true })
  overrideReason!: string | null;

  /** Override takes effect at this time. NULL means "immediately". */
  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt!: Date | null;

  /** Override expires at this time. NULL means "no expiry". */
  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => Feature, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'feature_id' })
  feature!: Feature;
}
