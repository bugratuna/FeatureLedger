import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { EntitlementResolverService, ResolvedEntitlement } from './entitlement-resolver.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { OrganizationEntitlement } from '../entities/organization-entitlement.entity';
import { OrganizationFeatureOverride } from '../entities/organization-feature-override.entity';

/**
 * Orchestrates the full entitlement recalculation pipeline for an organization.
 *
 * Flow:
 * 1. Load the current subscription (with addons).
 * 2. Load all overrides for the org.
 * 3. Delegate merge logic to EntitlementResolverService (pure, no DB writes).
 * 4. Atomically replace all snapshot rows for the org in a single transaction:
 *    - Upsert one OrganizationEntitlement per resolved feature.
 *    - Delete snapshot rows for features no longer included (stale cleanup).
 *
 * Idempotency: calling recalculate multiple times is safe. The transaction
 * replaces the full snapshot deterministically, so duplicate calls converge to
 * the same state.
 */
@Injectable()
export class EntitlementSnapshotService {
  constructor(
    @InjectRepository(OrganizationEntitlement)
    private readonly entitlementRepo: Repository<OrganizationEntitlement>,
    @InjectRepository(OrganizationFeatureOverride)
    private readonly overrideRepo: Repository<OrganizationFeatureOverride>,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly resolver: EntitlementResolverService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Recalculate the entitlement snapshot for an organization.
   *
   * Returns the full list of entitlement rows after recalculation so the caller
   * can return them in the API response without a second round-trip.
   */
  async recalculate(organizationId: string): Promise<OrganizationEntitlement[]> {
    // Load subscription with addons (throws SUBSCRIPTION_NOT_FOUND if none active)
    const subscription = await this.subscriptionsService.findCurrent(organizationId);

    // Load all overrides for the org (including inactive ones — resolver will filter)
    const overrides = await this.overrideRepo.find({
      where: { organizationId },
      relations: ['feature'],
    });

    // Pure resolution — no DB writes
    const resolved = await this.resolver.resolveForOrg(subscription, overrides);

    // Atomically persist the snapshot
    return this.dataSource.transaction(async (manager) => {
      const now = new Date();
      const resolvedFeatureIds = resolved.map((r) => r.featureId);

      // Delete stale rows first (features no longer entitled)
      const existingRows = await manager.find(OrganizationEntitlement, {
        where: { organizationId },
        select: ['id', 'featureId'],
      });

      const staleIds = existingRows
        .filter((row) => !resolvedFeatureIds.includes(row.featureId))
        .map((row) => row.id);

      if (staleIds.length > 0) {
        await manager.delete(OrganizationEntitlement, { id: In(staleIds) });
      }

      // Upsert one row per resolved entitlement
      const rows = resolved.map((r) =>
        this.buildSnapshotRow(organizationId, r, subscription, now, existingRows),
      );

      await manager.save(OrganizationEntitlement, rows);

      // Return the freshly persisted rows
      return manager.find(OrganizationEntitlement, { where: { organizationId } });
    });
  }

  /**
   * Read the current snapshot without recalculating.
   * Returns the rows as-is — callers should call recalculate if freshness matters.
   */
  async findSnapshot(organizationId: string): Promise<OrganizationEntitlement[]> {
    return this.entitlementRepo.find({ where: { organizationId } });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildSnapshotRow(
    organizationId: string,
    resolved: ResolvedEntitlement,
    subscription: { billingPeriodStart: Date; billingPeriodEnd: Date },
    now: Date,
    existingRows: OrganizationEntitlement[],
  ): Partial<OrganizationEntitlement> {
    // Preserve the existing row's id to trigger UPDATE (not INSERT) in upsert
    const existing = existingRows.find((r) => r.featureId === resolved.featureId);

    return {
      ...(existing ? { id: existing.id } : {}),
      organizationId,
      featureId: resolved.featureId,
      featureCode: resolved.featureCode,
      featureName: resolved.featureName,
      meterType: resolved.meterType,
      sourceType: resolved.sourceType,
      isEnabled: resolved.isEnabled,
      effectiveLimit: resolved.effectiveLimit,
      overagePolicy: resolved.overagePolicy,
      billingPeriodStart: subscription.billingPeriodStart,
      billingPeriodEnd: subscription.billingPeriodEnd,
      recalculatedAt: now,
    };
  }
}
