/**
 * Unit tests for EntitlementResolverService.merge().
 *
 * The merge function is a pure transformation — it takes pre-loaded plan features,
 * addon features, and overrides and returns resolved entitlements. No DB calls are
 * made in these tests; all inputs are constructed in-memory.
 *
 * Coverage:
 * - Plan features define base entitlements
 * - Addons expand limits additively
 * - Addons add features not in the plan
 * - Unlimited (null) limit propagation from plan or addon
 * - Override: force-disable a plan feature
 * - Override: force-enable a feature not in plan or addons (source=override)
 * - Override: replace computed limit with limitOverride
 * - Override: inactive (outside time window) is ignored
 * - Override: isEnabled=false on a feature not in plan/addons — no entry emitted
 * - Source type classification: plan, addon, mixed, override
 * - Overage policy: most permissive from plan and addon is kept
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { EntitlementResolverService, ResolverInput } from './entitlement-resolver.service';
import { AddonFeature } from '../../catalog/entities/addon-feature.entity';
import { Feature } from '../../catalog/entities/feature.entity';
import { PlanFeature } from '../../catalog/entities/plan-feature.entity';
import { MeterType } from '../../catalog/enums/meter-type.enum';
import { OveragePolicy } from '../../catalog/enums/overage-policy.enum';
import { Subscription } from '../../subscriptions/entities/subscription.entity';
import { OrganizationFeatureOverride } from '../entities/organization-feature-override.entity';
import { EntitlementSourceType } from '../enums/entitlement-source-type.enum';

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return Object.assign(new Feature(), {
    id: 'feat-1',
    code: 'api-calls',
    name: 'API Calls',
    meterType: MeterType.Usage,
    unitLabel: 'calls',
    ...overrides,
  });
}

function makePlanFeature(
  feature: Feature,
  includedLimit: number | null,
  overagePolicy: OveragePolicy = OveragePolicy.Deny,
): PlanFeature {
  return Object.assign(new PlanFeature(), {
    id: 'pf-1',
    planId: 'plan-1',
    featureId: feature.id,
    includedLimit,
    overagePolicy,
    feature,
  });
}

function makeAddonFeature(
  feature: Feature,
  includedLimit: number | null,
  overagePolicy: OveragePolicy = OveragePolicy.Deny,
  addonId = 'addon-1',
): AddonFeature {
  return Object.assign(new AddonFeature(), {
    id: 'af-1',
    addonId,
    featureId: feature.id,
    includedLimit,
    overagePolicy,
    feature,
  });
}

function makeOverride(
  feature: Feature,
  isEnabled: boolean,
  limitOverride: number | null = null,
  startsAt: Date | null = null,
  endsAt: Date | null = null,
): OrganizationFeatureOverride {
  return Object.assign(new OrganizationFeatureOverride(), {
    id: 'ov-1',
    organizationId: 'org-1',
    featureId: feature.id,
    isEnabled,
    limitOverride,
    overrideReason: null,
    startsAt,
    endsAt,
    feature,
  });
}

function makeSubscription(): Subscription {
  return Object.assign(new Subscription(), {
    id: 'sub-1',
    organizationId: 'org-1',
    planId: 'plan-1',
    billingPeriodStart: new Date('2025-01-01'),
    billingPeriodEnd: new Date('2025-02-01'),
    addons: [],
  });
}

function buildInput(overrides: Partial<ResolverInput> = {}): ResolverInput {
  return {
    subscription: makeSubscription(),
    planFeatures: [],
    addonFeaturesWithQuantity: [],
    overrides: [],
    ...overrides,
  };
}

const makeRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('EntitlementResolverService.merge()', () => {
  let service: EntitlementResolverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitlementResolverService,
        { provide: getRepositoryToken(PlanFeature), useValue: makeRepo() },
        { provide: getRepositoryToken(AddonFeature), useValue: makeRepo() },
        { provide: getRepositoryToken(OrganizationFeatureOverride), useValue: makeRepo() },
      ],
    }).compile();

    service = module.get(EntitlementResolverService);
  });

  // ── Plan features ──────────────────────────────────────────────────────────

  describe('plan features', () => {
    it('returns empty result when no sources', () => {
      const result = service.merge(buildInput());
      expect(result).toHaveLength(0);
    });

    it('maps plan feature with limit and overage policy', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 1000, OveragePolicy.SoftLimit);

      const result = service.merge(buildInput({ planFeatures: [pf] }));

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        featureId: feature.id,
        featureCode: 'api-calls',
        isEnabled: true,
        effectiveLimit: 1000,
        overagePolicy: OveragePolicy.SoftLimit,
        sourceType: EntitlementSourceType.Plan,
      });
    });

    it('treats null includedLimit as unlimited', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, null);

      const [result] = service.merge(buildInput({ planFeatures: [pf] }));
      expect(result.effectiveLimit).toBeNull();
    });

    it('handles boolean features', () => {
      const feature = makeFeature({ meterType: MeterType.Boolean, code: 'sso' });
      const pf = makePlanFeature(feature, null);

      const [result] = service.merge(buildInput({ planFeatures: [pf] }));
      expect(result.meterType).toBe(MeterType.Boolean);
      expect(result.isEnabled).toBe(true);
    });
  });

  // ── Addon features ─────────────────────────────────────────────────────────

  describe('addon features', () => {
    it('adds addon limit to plan limit (additive)', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 500);
      const af = makeAddonFeature(feature, 200);

      const result = service.merge(
        buildInput({
          planFeatures: [pf],
          addonFeaturesWithQuantity: [{ addonFeature: af, quantity: 1 }],
        }),
      );

      expect(result[0].effectiveLimit).toBe(700);
      expect(result[0].sourceType).toBe(EntitlementSourceType.Mixed);
    });

    it('multiplies addon limit by quantity', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 100);
      const af = makeAddonFeature(feature, 50);

      const result = service.merge(
        buildInput({
          planFeatures: [pf],
          addonFeaturesWithQuantity: [{ addonFeature: af, quantity: 3 }],
        }),
      );

      expect(result[0].effectiveLimit).toBe(250); // 100 + 50*3
    });

    it('makes result unlimited when addon has null limit', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 500);
      const af = makeAddonFeature(feature, null);

      const [result] = service.merge(
        buildInput({
          planFeatures: [pf],
          addonFeaturesWithQuantity: [{ addonFeature: af, quantity: 1 }],
        }),
      );

      expect(result.effectiveLimit).toBeNull();
    });

    it('makes result unlimited when plan limit is null (unlimited base)', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, null);
      const af = makeAddonFeature(feature, 200);

      const [result] = service.merge(
        buildInput({
          planFeatures: [pf],
          addonFeaturesWithQuantity: [{ addonFeature: af, quantity: 1 }],
        }),
      );

      expect(result.effectiveLimit).toBeNull();
    });

    it('adds a feature that is in addon but not in plan (source=addon)', () => {
      const feature = makeFeature({ id: 'feat-new', code: 'export-pdf' });
      const af = makeAddonFeature(feature, 10);

      const [result] = service.merge(
        buildInput({ addonFeaturesWithQuantity: [{ addonFeature: af, quantity: 2 }] }),
      );

      expect(result.featureCode).toBe('export-pdf');
      expect(result.effectiveLimit).toBe(20); // 10 * 2
      expect(result.sourceType).toBe(EntitlementSourceType.Addon);
    });

    it('uses more permissive overage policy between plan and addon', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 100, OveragePolicy.Deny);
      const af = makeAddonFeature(feature, 50, OveragePolicy.AllowAndFlag);

      const [result] = service.merge(
        buildInput({
          planFeatures: [pf],
          addonFeaturesWithQuantity: [{ addonFeature: af, quantity: 1 }],
        }),
      );

      expect(result.overagePolicy).toBe(OveragePolicy.AllowAndFlag);
    });
  });

  // ── Overrides ──────────────────────────────────────────────────────────────

  describe('overrides', () => {
    it('force-disables a plan feature (isEnabled=false)', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 1000);
      const override = makeOverride(feature, false);

      const [result] = service.merge(buildInput({ planFeatures: [pf], overrides: [override] }));

      expect(result.isEnabled).toBe(false);
      expect(result.sourceType).toBe(EntitlementSourceType.Mixed);
    });

    it('force-enables a feature not in plan or addons (source=override)', () => {
      const feature = makeFeature({ id: 'feat-premium', code: 'white-label' });
      const override = makeOverride(feature, true, 5);

      const [result] = service.merge(buildInput({ overrides: [override] }));

      expect(result.featureCode).toBe('white-label');
      expect(result.isEnabled).toBe(true);
      expect(result.effectiveLimit).toBe(5);
      expect(result.sourceType).toBe(EntitlementSourceType.Override);
    });

    it('replaces computed limit when limitOverride is set', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 100);
      const override = makeOverride(feature, true, 9999);

      const [result] = service.merge(buildInput({ planFeatures: [pf], overrides: [override] }));

      expect(result.effectiveLimit).toBe(9999);
    });

    it('does not replace computed limit when limitOverride is null', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 100);
      const override = makeOverride(feature, true, null);

      const [result] = service.merge(buildInput({ planFeatures: [pf], overrides: [override] }));

      expect(result.effectiveLimit).toBe(100); // unchanged
    });

    it('ignores a disable override for a feature not in plan/addons', () => {
      const feature = makeFeature({ id: 'feat-x', code: 'feature-x' });
      const override = makeOverride(feature, false);

      const result = service.merge(buildInput({ overrides: [override] }));

      // No entry should be emitted — there was nothing to disable
      expect(result).toHaveLength(0);
    });

    it('ignores an override whose time window has passed (endsAt in the past)', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 100);

      const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const override = makeOverride(feature, false, null, null, pastDate);

      const [result] = service.merge(buildInput({ planFeatures: [pf], overrides: [override] }));

      // Override is expired — feature should remain enabled
      expect(result.isEnabled).toBe(true);
    });

    it('ignores an override whose time window has not started (startsAt in the future)', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 100);

      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24); // 1 day from now
      const override = makeOverride(feature, false, null, futureDate, null);

      const [result] = service.merge(buildInput({ planFeatures: [pf], overrides: [override] }));

      expect(result.isEnabled).toBe(true);
    });

    it('applies an override within a valid time window', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 100);

      const past = new Date(Date.now() - 1000 * 60 * 60);
      const future = new Date(Date.now() + 1000 * 60 * 60);
      const override = makeOverride(feature, false, null, past, future);

      const [result] = service.merge(buildInput({ planFeatures: [pf], overrides: [override] }));

      expect(result.isEnabled).toBe(false);
    });

    it('override does not change overagePolicy', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 100, OveragePolicy.AllowAndFlag);
      const override = makeOverride(feature, true, 200);

      const [result] = service.merge(buildInput({ planFeatures: [pf], overrides: [override] }));

      expect(result.overagePolicy).toBe(OveragePolicy.AllowAndFlag);
    });
  });

  // ── Source type classification ──────────────────────────────────────────────

  describe('source type classification', () => {
    it('plan only → Plan', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 100);
      const [result] = service.merge(buildInput({ planFeatures: [pf] }));
      expect(result.sourceType).toBe(EntitlementSourceType.Plan);
    });

    it('addon only → Addon', () => {
      const feature = makeFeature();
      const af = makeAddonFeature(feature, 50);
      const [result] = service.merge(
        buildInput({ addonFeaturesWithQuantity: [{ addonFeature: af, quantity: 1 }] }),
      );
      expect(result.sourceType).toBe(EntitlementSourceType.Addon);
    });

    it('plan + addon → Mixed', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 100);
      const af = makeAddonFeature(feature, 50);
      const [result] = service.merge(
        buildInput({
          planFeatures: [pf],
          addonFeaturesWithQuantity: [{ addonFeature: af, quantity: 1 }],
        }),
      );
      expect(result.sourceType).toBe(EntitlementSourceType.Mixed);
    });

    it('override-only grant → Override', () => {
      const feature = makeFeature();
      const override = makeOverride(feature, true);
      const [result] = service.merge(buildInput({ overrides: [override] }));
      expect(result.sourceType).toBe(EntitlementSourceType.Override);
    });

    it('plan + active override → Mixed', () => {
      const feature = makeFeature();
      const pf = makePlanFeature(feature, 100);
      const override = makeOverride(feature, true, 200);
      const [result] = service.merge(buildInput({ planFeatures: [pf], overrides: [override] }));
      expect(result.sourceType).toBe(EntitlementSourceType.Mixed);
    });
  });

  // ── Multi-feature scenarios ────────────────────────────────────────────────

  describe('multi-feature scenarios', () => {
    it('handles multiple features independently', () => {
      const feat1 = makeFeature({ id: 'f1', code: 'api-calls' });
      const feat2 = makeFeature({ id: 'f2', code: 'seats', meterType: MeterType.Seats });

      const pf1 = makePlanFeature(feat1, 1000);
      const pf2 = makePlanFeature(feat2, 5);
      pf2.id = 'pf-2';
      pf2.featureId = 'f2';

      const result = service.merge(buildInput({ planFeatures: [pf1, pf2] }));
      expect(result).toHaveLength(2);

      const apiResult = result.find((r) => r.featureCode === 'api-calls');
      const seatsResult = result.find((r) => r.featureCode === 'seats');
      expect(apiResult?.effectiveLimit).toBe(1000);
      expect(seatsResult?.effectiveLimit).toBe(5);
    });
  });
});
