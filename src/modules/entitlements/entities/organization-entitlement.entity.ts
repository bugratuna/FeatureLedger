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
import { MeterType } from '../../catalog/enums/meter-type.enum';
import { OveragePolicy } from '../../catalog/enums/overage-policy.enum';
import { EntitlementSourceType } from '../enums/entitlement-source-type.enum';

/**
 * Precomputed entitlement snapshot for one feature within one organization.
 *
 * This table is the single source of truth for access decisions. It is rebuilt
 * by EntitlementSnapshotService.recalculate() whenever the subscription, addons,
 * or overrides change.
 *
 * Denormalized fields (featureCode, featureName, meterType) are included so that
 * access checks do not require a join to the features table — a single index scan
 * on (organizationId) is enough to serve the full entitlement set.
 *
 * The snapshot row is replaced atomically on recalculation; stale rows from
 * removed features are deleted in the same transaction.
 */
@Entity('organization_entitlements')
@Unique('uq_entitlement_org_feature', ['organizationId', 'featureId'])
@Index('idx_entitlement_org_id', ['organizationId'])
export class OrganizationEntitlement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'feature_id', type: 'uuid' })
  featureId!: string;

  /** Denormalized from Feature for O(1) access-check lookups by code. */
  @Column({ name: 'feature_code', type: 'varchar', length: 100 })
  featureCode!: string;

  /** Denormalized from Feature for display in API responses. */
  @Column({ name: 'feature_name', type: 'varchar', length: 255 })
  featureName!: string;

  /** Denormalized from Feature; drives access-decision logic (boolean vs. limit-based). */
  @Column({ name: 'meter_type', type: 'enum', enum: MeterType })
  meterType!: MeterType;

  /** Which billing source(s) contributed to this entitlement. */
  @Column({ name: 'source_type', type: 'enum', enum: EntitlementSourceType })
  sourceType!: EntitlementSourceType;

  /** False means an override explicitly disabled this feature. */
  @Column({ name: 'is_enabled', type: 'boolean' })
  isEnabled!: boolean;

  /**
   * The resolved maximum units allowed. NULL means unlimited.
   * Derived as: plan base limit + sum(addonFeature.includedLimit × quantity),
   * then replaced by override.limitOverride when an active override is present.
   */
  @Column({ name: 'effective_limit', type: 'integer', nullable: true })
  effectiveLimit!: number | null;

  /** Most permissive overage policy across plan and addons. Not affected by overrides. */
  @Column({ name: 'overage_policy', type: 'enum', enum: OveragePolicy })
  overagePolicy!: OveragePolicy;

  /** Copied from the subscription billing period for context. Nullable if no subscription. */
  @Column({ name: 'billing_period_start', type: 'timestamptz', nullable: true })
  billingPeriodStart!: Date | null;

  /** Copied from the subscription billing period for context. Nullable if no subscription. */
  @Column({ name: 'billing_period_end', type: 'timestamptz', nullable: true })
  billingPeriodEnd!: Date | null;

  /** Timestamp of the most recent recalculation. Used to detect stale snapshots. */
  @Column({ name: 'recalculated_at', type: 'timestamptz' })
  recalculatedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => Feature, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'feature_id' })
  feature!: Feature;
}
