import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { AddonFeature } from '../../catalog/entities/addon-feature.entity';
import { PlanFeature } from '../../catalog/entities/plan-feature.entity';
import { MeterType } from '../../catalog/enums/meter-type.enum';
import { OveragePolicy } from '../../catalog/enums/overage-policy.enum';
import { Subscription } from '../../subscriptions/entities/subscription.entity';
import { isOverrideActive } from '../dto/override-response.dto';
import { OrganizationFeatureOverride } from '../entities/organization-feature-override.entity';
import { EntitlementSourceType } from '../enums/entitlement-source-type.enum';

// ── Internal types ─────────────────────────────────────────────────────────────

/**
 * The resolved effective state for one feature within one organization.
 * This is an intermediate computation object — not an entity, not a DTO.
 * EntitlementSnapshotService persists these; AccessDecisionService evaluates them.
 */
export interface ResolvedEntitlement {
  featureId: string;
  featureCode: string;
  featureName: string;
  meterType: MeterType;
  isEnabled: boolean;
  effectiveLimit: number | null;
  overagePolicy: OveragePolicy;
  sourceType: EntitlementSourceType;
}

/**
 * Inputs supplied by the caller. Using explicit input objects makes the resolver
 * a pure function (no DB calls) when used in simulation mode.
 */
export interface ResolverInput {
  subscription: Subscription;
  planFeatures: PlanFeature[];
  addonFeaturesWithQuantity: { addonFeature: AddonFeature; quantity: number }[];
  overrides: OrganizationFeatureOverride[];
}

// ── Overage policy ordering ────────────────────────────────────────────────────

const OVERAGE_POLICY_RANK: Record<OveragePolicy, number> = {
  [OveragePolicy.Deny]: 0,
  [OveragePolicy.SoftLimit]: 1,
  [OveragePolicy.AllowAndFlag]: 2,
};

function morePermissive(a: OveragePolicy, b: OveragePolicy): OveragePolicy {
  return OVERAGE_POLICY_RANK[a] >= OVERAGE_POLICY_RANK[b] ? a : b;
}

// ── Service ────────────────────────────────────────────────────────────────────

/**
 * Resolves the effective set of feature entitlements for an organization.
 *
 * This service is intentionally stateless and side-effect-free. It reads the
 * catalog (PlanFeature, AddonFeature) and override rows, then applies merge rules
 * to produce a list of ResolvedEntitlement objects. No rows are written here.
 *
 * Merge rules (applied in order, later rules win):
 * 1. Plan features define the base inclusion, base limit, and base overage policy.
 * 2. Addon features expand capacity additively (limit += addonLimit × quantity).
 *    If the addon introduces a feature not in the plan, it is added as source=addon.
 *    The most permissive overage policy across plan and addon is kept.
 * 3. Active overrides win last:
 *    - isEnabled=false: force-disable the feature (kept in output with isEnabled=false
 *      so callers can distinguish "absent" from "explicitly disabled").
 *    - isEnabled=true: ensure the feature is enabled; if not already in plan/addons,
 *      add it with source=override.
 *    - limitOverride set: replace the computed limit entirely.
 *    - Overrides do not affect overagePolicy (conservative: keep computed policy).
 * 4. If no source grants a feature, it does not appear in the output.
 */
@Injectable()
export class EntitlementResolverService {
  constructor(
    @InjectRepository(PlanFeature)
    private readonly planFeatureRepo: Repository<PlanFeature>,
    @InjectRepository(AddonFeature)
    private readonly addonFeatureRepo: Repository<AddonFeature>,
    @InjectRepository(OrganizationFeatureOverride)
    private readonly overrideRepo: Repository<OrganizationFeatureOverride>,
  ) {}

  /**
   * Load all inputs for the given organization and subscription from the DB,
   * then run the merge algorithm. Used by the snapshot recalculation flow.
   */
  async resolveForOrg(
    subscription: Subscription,
    overrides: OrganizationFeatureOverride[],
  ): Promise<ResolvedEntitlement[]> {
    const planFeatures = await this.planFeatureRepo.find({
      where: { planId: subscription.planId },
      relations: ['feature'],
    });

    const addonIds = subscription.addons?.map((sa) => sa.addonId) ?? [];
    const addonFeatures =
      addonIds.length > 0
        ? await this.addonFeatureRepo.find({
            where: { addonId: In(addonIds) },
            relations: ['feature'],
          })
        : [];

    const addonFeaturesWithQuantity = addonFeatures.map((af) => ({
      addonFeature: af,
      quantity: subscription.addons.find((sa) => sa.addonId === af.addonId)?.quantity ?? 1,
    }));

    return this.merge({ subscription, planFeatures, addonFeaturesWithQuantity, overrides });
  }

  /**
   * Pure merge function. Accepts pre-loaded inputs so it can be used for
   * simulation without any DB calls (the simulation endpoint passes hypothetical data).
   */
  merge(input: ResolverInput): ResolvedEntitlement[] {
    const { planFeatures, addonFeaturesWithQuantity, overrides } = input;
    const map = new Map<string, ResolvedEntitlement>();

    // ── Step 1: Base from plan features ─────────────────────────────────────
    for (const pf of planFeatures) {
      map.set(pf.featureId, {
        featureId: pf.featureId,
        featureCode: pf.feature.code,
        featureName: pf.feature.name,
        meterType: pf.feature.meterType,
        isEnabled: true,
        effectiveLimit: pf.includedLimit,
        overagePolicy: pf.overagePolicy,
        sourceType: EntitlementSourceType.Plan,
      });
    }

    // ── Step 2: Merge addon features ────────────────────────────────────────
    for (const { addonFeature: af, quantity } of addonFeaturesWithQuantity) {
      const existing = map.get(af.featureId);

      if (existing) {
        // Feature already in plan: expand limit additively.
        // If either source has unlimited (null), the result is unlimited.
        if (existing.effectiveLimit !== null && af.includedLimit !== null) {
          existing.effectiveLimit += af.includedLimit * quantity;
        } else {
          existing.effectiveLimit = null;
        }

        // Take the more permissive overage policy.
        existing.overagePolicy = morePermissive(existing.overagePolicy, af.overagePolicy);

        // Upgrade source classification to reflect multiple sources.
        existing.sourceType = EntitlementSourceType.Mixed;
      } else {
        // Feature exists only in this addon — add it.
        const addonLimit = af.includedLimit !== null ? af.includedLimit * quantity : null;
        map.set(af.featureId, {
          featureId: af.featureId,
          featureCode: af.feature.code,
          featureName: af.feature.name,
          meterType: af.feature.meterType,
          isEnabled: true,
          effectiveLimit: addonLimit,
          overagePolicy: af.overagePolicy,
          sourceType: EntitlementSourceType.Addon,
        });
      }
    }

    // ── Step 3: Apply active overrides (win last) ────────────────────────────
    const activeOverrides = overrides.filter(isOverrideActive);

    for (const override of activeOverrides) {
      const existing = map.get(override.featureId);

      if (!override.isEnabled) {
        // Force-disable: keep in map with isEnabled=false so access checks can
        // distinguish "explicitly blocked" from "feature not on any plan".
        if (existing) {
          existing.isEnabled = false;
          existing.sourceType = EntitlementSourceType.Mixed;
        }
        // If the feature wasn't in plan/addons, there is nothing to disable.
      } else {
        // Force-enable.
        if (existing) {
          existing.isEnabled = true;
          if (override.limitOverride !== null) {
            existing.effectiveLimit = override.limitOverride;
          }
          existing.sourceType = EntitlementSourceType.Mixed;
        } else {
          // Override grants a feature not present in plan or addons.
          // We need the feature's code/name/meterType — they must be loaded with the override.
          map.set(override.featureId, {
            featureId: override.featureId,
            featureCode: override.feature.code,
            featureName: override.feature.name,
            meterType: override.feature.meterType,
            isEnabled: true,
            effectiveLimit: override.limitOverride ?? null,
            overagePolicy: OveragePolicy.Deny, // conservative default for override-only features
            sourceType: EntitlementSourceType.Override,
          });
        }
      }
    }

    return Array.from(map.values());
  }
}
