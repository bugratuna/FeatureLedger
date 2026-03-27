import { NotFoundException } from '@common/exceptions/app.exception';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { AddonFeature } from '../../catalog/entities/addon-feature.entity';
import { Feature } from '../../catalog/entities/feature.entity';
import { PlanFeature } from '../../catalog/entities/plan-feature.entity';
import { MeterType } from '../../catalog/enums/meter-type.enum';
import { OrganizationEntitlement } from '../../entitlements/entities/organization-entitlement.entity';
import { OrganizationFeatureOverride } from '../../entitlements/entities/organization-feature-override.entity';
import { EntitlementResolverService } from '../../entitlements/services/entitlement-resolver.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { AccessCheckResponseDto } from '../dto/access-check-response.dto';
import { AccessCheckDto } from '../dto/access-check.dto';
import { AccessSimulateResponseDto } from '../dto/access-simulate-response.dto';
import { AccessSimulateDto } from '../dto/access-simulate.dto';

/**
 * Evaluates access decisions for organization features.
 *
 * Access check: reads the precomputed OrganizationEntitlement snapshot.
 * Simulation: resolves entitlements on-the-fly from hypothetical inputs without persisting.
 *
 * Decision rules for access check:
 * - If no snapshot row exists for the feature: denied (feature_not_included).
 * - If snapshot row has isEnabled=false: denied (feature_disabled).
 * - Boolean features (MeterType.Boolean): allowed if enabled.
 * - Limit-based features (quantity, seats, storage, usage):
 *   - effectiveLimit=null means unlimited → always allowed.
 *   - effectiveLimit >= requestedQuantity → allowed (quota_available).
 *   - effectiveLimit < requestedQuantity → denied (quota_exceeded).
 * - consumed/remaining: null placeholder until Phase 4 usage metering is live.
 */
@Injectable()
export class AccessDecisionService {
  constructor(
    @InjectRepository(OrganizationEntitlement)
    private readonly entitlementRepo: Repository<OrganizationEntitlement>,
    @InjectRepository(Feature)
    private readonly featureRepo: Repository<Feature>,
    @InjectRepository(PlanFeature)
    private readonly planFeatureRepo: Repository<PlanFeature>,
    @InjectRepository(AddonFeature)
    private readonly addonFeatureRepo: Repository<AddonFeature>,
    @InjectRepository(OrganizationFeatureOverride)
    private readonly overrideRepo: Repository<OrganizationFeatureOverride>,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly resolver: EntitlementResolverService,
  ) {}

  // ── Access check ───────────────────────────────────────────────────────────

  async check(organizationId: string, dto: AccessCheckDto): Promise<AccessCheckResponseDto> {
    const requestedQuantity = dto.requestedQuantity ?? 1;

    // Look up the snapshot row by organizationId + featureCode (denormalized — no join needed)
    const snapshot = await this.entitlementRepo.findOne({
      where: { organizationId, featureCode: dto.featureCode },
    });

    if (!snapshot) {
      return this.buildDenied(dto.featureCode, 'feature_not_included', null);
    }

    if (!snapshot.isEnabled) {
      return this.buildDenied(dto.featureCode, 'feature_disabled', snapshot.effectiveLimit);
    }

    // Boolean features: access is granted by inclusion alone
    if (snapshot.meterType === MeterType.Boolean) {
      return this.buildAllowed(dto.featureCode, 'feature_included', null);
    }

    // Limit-based features: compare requestedQuantity against effectiveLimit
    if (snapshot.effectiveLimit === null) {
      // Unlimited — always allowed
      return this.buildAllowed(dto.featureCode, 'quota_available', null);
    }

    if (requestedQuantity <= snapshot.effectiveLimit) {
      return this.buildAllowed(dto.featureCode, 'quota_available', snapshot.effectiveLimit);
    }

    return this.buildDenied(dto.featureCode, 'quota_exceeded', snapshot.effectiveLimit);
  }

  // ── Simulation ─────────────────────────────────────────────────────────────

  async simulate(
    organizationId: string,
    dto: AccessSimulateDto,
  ): Promise<AccessSimulateResponseDto> {
    // Load the current subscription — we need billing period info at minimum.
    // The simulation can override the plan and/or addons.
    const subscription = await this.subscriptionsService.findCurrent(organizationId);

    // Resolve plan features: use hypothetical plan if provided, otherwise current plan
    const planId = dto.planId ?? subscription.planId;
    const planFeatures = await this.planFeatureRepo.find({
      where: { planId },
      relations: ['feature'],
    });

    // Resolve addons: use hypothetical set if provided, otherwise current addons
    let addonFeaturesWithQuantity: { addonFeature: AddonFeature; quantity: number }[];

    if (dto.addons !== undefined) {
      const hypotheticalAddonIds = dto.addons.map((a) => a.addonId);
      const addonFeatures =
        hypotheticalAddonIds.length > 0
          ? await this.addonFeatureRepo.find({
              where: { addonId: In(hypotheticalAddonIds) },
              relations: ['feature'],
            })
          : [];

      addonFeaturesWithQuantity = addonFeatures.map((af) => ({
        addonFeature: af,
        quantity: dto.addons!.find((a) => a.addonId === af.addonId)?.quantity ?? 1,
      }));
    } else {
      // Use current subscription addons
      const currentAddonIds = subscription.addons?.map((sa) => sa.addonId) ?? [];
      const addonFeatures =
        currentAddonIds.length > 0
          ? await this.addonFeatureRepo.find({
              where: { addonId: In(currentAddonIds) },
              relations: ['feature'],
            })
          : [];

      addonFeaturesWithQuantity = addonFeatures.map((af) => ({
        addonFeature: af,
        quantity: subscription.addons.find((sa) => sa.addonId === af.addonId)?.quantity ?? 1,
      }));
    }

    // Resolve overrides: use hypothetical set if provided, otherwise current active overrides
    let overrides: OrganizationFeatureOverride[];

    if (dto.overrides !== undefined) {
      overrides = await this.buildHypotheticalOverrides(organizationId, dto.overrides);
    } else {
      overrides = await this.overrideRepo.find({
        where: { organizationId },
        relations: ['feature'],
      });
    }

    const resolved = this.resolver.merge({
      subscription,
      planFeatures,
      addonFeaturesWithQuantity,
      overrides,
    });

    return AccessSimulateResponseDto.from(resolved);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildAllowed(
    featureCode: string,
    reason: 'feature_included' | 'quota_available',
    limit: number | null,
  ): AccessCheckResponseDto {
    const response = new AccessCheckResponseDto();
    response.allowed = true;
    response.reason = reason;
    response.featureCode = featureCode;
    response.limit = limit;
    response.consumed = null; // Phase 4
    response.remaining = null; // Phase 4
    return response;
  }

  private buildDenied(
    featureCode: string,
    reason: 'feature_not_included' | 'feature_disabled' | 'quota_exceeded',
    limit: number | null,
  ): AccessCheckResponseDto {
    const response = new AccessCheckResponseDto();
    response.allowed = false;
    response.reason = reason;
    response.featureCode = featureCode;
    response.limit = limit;
    response.consumed = null; // Phase 4
    response.remaining = null; // Phase 4
    return response;
  }

  /**
   * Build synthetic OrganizationFeatureOverride objects from simulation input.
   * These are not persisted — they are passed directly into the resolver's merge function.
   */
  private async buildHypotheticalOverrides(
    organizationId: string,
    simulatedOverrides: NonNullable<AccessSimulateDto['overrides']>,
  ): Promise<OrganizationFeatureOverride[]> {
    if (simulatedOverrides.length === 0) return [];

    const featureIds = simulatedOverrides.map((o) => o.featureId);
    const features = await this.featureRepo.find({ where: { id: In(featureIds) } });
    const featureMap = new Map(features.map((f) => [f.id, f]));

    // Validate all feature IDs
    for (const o of simulatedOverrides) {
      if (!featureMap.has(o.featureId)) {
        throw new NotFoundException('Feature', o.featureId);
      }
    }

    return simulatedOverrides.map((o) => {
      const override = new OrganizationFeatureOverride();
      override.id = 'simulated';
      override.organizationId = organizationId;
      override.featureId = o.featureId;
      override.isEnabled = o.isEnabled;
      override.limitOverride = o.limitOverride ?? null;
      override.overrideReason = null;
      override.startsAt = null; // always active in simulation
      override.endsAt = null;
      override.feature = featureMap.get(o.featureId)!;
      return override;
    });
  }
}
