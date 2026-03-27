/**
 * Integration tests for entitlement snapshot persistence and access decisions.
 *
 * These tests run against a real PostgreSQL container (Testcontainers).
 * They verify the full pipeline: subscription + plan + addons + overrides → snapshot.
 *
 * Coverage:
 * - Recalculate creates correct snapshot rows (plan features, addon features, overrides)
 * - Limit merging is additive (plan + addon)
 * - Overrides force-disable a feature in the snapshot
 * - Override-only grants create snapshot rows
 * - Recalculate is org-scoped (another org's data is not included)
 * - Stale rows are cleaned up when features are removed
 * - Access check reads from snapshot (allow, deny, quota exceeded)
 */

import { DataSource, Repository } from 'typeorm';

import { AccessDecisionService } from '../../src/modules/access/services/access-decision.service';
import { AddonFeature } from '../../src/modules/catalog/entities/addon-feature.entity';
import { Addon } from '../../src/modules/catalog/entities/addon.entity';
import { Feature } from '../../src/modules/catalog/entities/feature.entity';
import { PlanFeature } from '../../src/modules/catalog/entities/plan-feature.entity';
import { Plan } from '../../src/modules/catalog/entities/plan.entity';
import { MeterType } from '../../src/modules/catalog/enums/meter-type.enum';
import { OveragePolicy } from '../../src/modules/catalog/enums/overage-policy.enum';
import { OrganizationEntitlement } from '../../src/modules/entitlements/entities/organization-entitlement.entity';
import { OrganizationFeatureOverride } from '../../src/modules/entitlements/entities/organization-feature-override.entity';
import { EntitlementSourceType } from '../../src/modules/entitlements/enums/entitlement-source-type.enum';
import { EntitlementResolverService } from '../../src/modules/entitlements/services/entitlement-resolver.service';
import { EntitlementSnapshotService } from '../../src/modules/entitlements/services/entitlement-snapshot.service';
import { Organization } from '../../src/modules/organizations/entities/organization.entity';
import { SubscriptionAddon } from '../../src/modules/subscriptions/entities/subscription-addon.entity';
import { Subscription } from '../../src/modules/subscriptions/entities/subscription.entity';
import { SubscriptionStatus } from '../../src/modules/subscriptions/enums/subscription-status.enum';
import { SubscriptionsService } from '../../src/modules/subscriptions/subscriptions.service';
import { setupTestDatabase, teardownTestDatabase, clearDatabase, TestDatabase } from '../helpers/database';

// ── Fixture helpers ────────────────────────────────────────────────────────────

async function seedOrg(ds: DataSource, slug: string): Promise<Organization> {
  return ds.getRepository(Organization).save(
    ds.getRepository(Organization).create({ name: `Org ${slug}`, slug, isActive: true }),
  );
}

async function seedPlan(ds: DataSource, slug: string): Promise<Plan> {
  return ds.getRepository(Plan).save(
    ds.getRepository(Plan).create({ name: `Plan ${slug}`, slug, isActive: true }),
  );
}

async function seedFeature(ds: DataSource, code: string, meterType = MeterType.Usage): Promise<Feature> {
  return ds.getRepository(Feature).save(
    ds.getRepository(Feature).create({
      code,
      name: `Feature ${code}`,
      meterType,
      unitLabel: null,
    }),
  );
}

async function seedPlanFeature(
  ds: DataSource,
  plan: Plan,
  feature: Feature,
  limit: number | null,
  overagePolicy = OveragePolicy.Deny,
): Promise<PlanFeature> {
  return ds.getRepository(PlanFeature).save(
    ds.getRepository(PlanFeature).create({
      planId: plan.id,
      featureId: feature.id,
      includedLimit: limit,
      overagePolicy,
    }),
  );
}

async function seedAddon(ds: DataSource, slug: string): Promise<Addon> {
  return ds.getRepository(Addon).save(
    ds.getRepository(Addon).create({ name: `Addon ${slug}`, slug }),
  );
}

async function seedAddonFeature(
  ds: DataSource,
  addon: Addon,
  feature: Feature,
  limit: number | null,
): Promise<AddonFeature> {
  return ds.getRepository(AddonFeature).save(
    ds.getRepository(AddonFeature).create({
      addonId: addon.id,
      featureId: feature.id,
      includedLimit: limit,
      overagePolicy: OveragePolicy.Deny,
    }),
  );
}

async function seedSubscription(
  ds: DataSource,
  org: Organization,
  plan: Plan,
  status = SubscriptionStatus.Active,
): Promise<Subscription> {
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return ds.getRepository(Subscription).save(
    ds.getRepository(Subscription).create({
      organizationId: org.id,
      planId: plan.id,
      status,
      billingPeriodStart: start,
      billingPeriodEnd: end,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    }),
  );
}

async function attachAddon(ds: DataSource, sub: Subscription, addon: Addon, quantity = 1) {
  return ds.getRepository(SubscriptionAddon).save(
    ds.getRepository(SubscriptionAddon).create({
      subscriptionId: sub.id,
      addonId: addon.id,
      quantity,
    }),
  );
}

async function seedOverride(
  ds: DataSource,
  org: Organization,
  feature: Feature,
  isEnabled: boolean,
  limitOverride: number | null = null,
): Promise<OrganizationFeatureOverride> {
  return ds.getRepository(OrganizationFeatureOverride).save(
    ds.getRepository(OrganizationFeatureOverride).create({
      organizationId: org.id,
      featureId: feature.id,
      isEnabled,
      limitOverride,
      overrideReason: null,
      startsAt: null,
      endsAt: null,
    }),
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('EntitlementSnapshotService + AccessDecisionService (integration)', () => {
  let db: TestDatabase;
  let dataSource: DataSource;

  let subRepo: Repository<Subscription>;
  let subAddonRepo: Repository<SubscriptionAddon>;
  let planRepo: Repository<Plan>;
  let addonRepo: Repository<Addon>;
  let planFeatureRepo: Repository<PlanFeature>;
  let addonFeatureRepo: Repository<AddonFeature>;
  let overrideRepo: Repository<OrganizationFeatureOverride>;
  let entitlementRepo: Repository<OrganizationEntitlement>;
  let featureRepo: Repository<Feature>;

  let subscriptionsService: SubscriptionsService;
  let resolver: EntitlementResolverService;
  let snapshotService: EntitlementSnapshotService;
  let accessService: AccessDecisionService;

  beforeAll(async () => {
    db = await setupTestDatabase();
    dataSource = db.dataSource;

    subRepo = dataSource.getRepository(Subscription);
    subAddonRepo = dataSource.getRepository(SubscriptionAddon);
    planRepo = dataSource.getRepository(Plan);
    addonRepo = dataSource.getRepository(Addon);
    planFeatureRepo = dataSource.getRepository(PlanFeature);
    addonFeatureRepo = dataSource.getRepository(AddonFeature);
    overrideRepo = dataSource.getRepository(OrganizationFeatureOverride);
    entitlementRepo = dataSource.getRepository(OrganizationEntitlement);
    featureRepo = dataSource.getRepository(Feature);

    subscriptionsService = new SubscriptionsService(
      subRepo,
      subAddonRepo,
      planRepo,
      addonRepo,
      dataSource,
    );

    resolver = new EntitlementResolverService(planFeatureRepo, addonFeatureRepo, overrideRepo);

    snapshotService = new EntitlementSnapshotService(
      entitlementRepo,
      overrideRepo,
      subscriptionsService,
      resolver,
      dataSource,
    );

    accessService = new AccessDecisionService(
      entitlementRepo,
      featureRepo,
      planFeatureRepo,
      addonFeatureRepo,
      overrideRepo,
      subscriptionsService,
      resolver,
    );
  });

  afterAll(async () => {
    await teardownTestDatabase(db);
  });

  beforeEach(async () => {
    await clearDatabase(dataSource);
  });

  // ── Snapshot creation from plan features ───────────────────────────────────

  describe('recalculate — plan features', () => {
    it('creates one snapshot row per plan feature', async () => {
      const org = await seedOrg(dataSource, 'snap-plan-org');
      const plan = await seedPlan(dataSource, 'snap-plan');
      const feat1 = await seedFeature(dataSource, 'api-calls');
      const feat2 = await seedFeature(dataSource, 'seats', MeterType.Seats);
      await seedPlanFeature(dataSource, plan, feat1, 1000, OveragePolicy.Deny);
      await seedPlanFeature(dataSource, plan, feat2, 5);
      await seedSubscription(dataSource, org, plan);

      const rows = await snapshotService.recalculate(org.id);

      expect(rows).toHaveLength(2);
      const apiRow = rows.find((r) => r.featureCode === 'api-calls');
      expect(apiRow).toMatchObject({
        organizationId: org.id,
        isEnabled: true,
        effectiveLimit: 1000,
        overagePolicy: OveragePolicy.Deny,
        sourceType: EntitlementSourceType.Plan,
      });
    });

    it('stores billing period from subscription', async () => {
      const org = await seedOrg(dataSource, 'billing-period-org');
      const plan = await seedPlan(dataSource, 'billing-period-plan');
      const feat = await seedFeature(dataSource, 'export-pdf', MeterType.Boolean);
      await seedPlanFeature(dataSource, plan, feat, null);
      const sub = await seedSubscription(dataSource, org, plan);

      const [row] = await snapshotService.recalculate(org.id);

      expect(row.billingPeriodStart?.toISOString()).toBe(sub.billingPeriodStart.toISOString());
      expect(row.billingPeriodEnd?.toISOString()).toBe(sub.billingPeriodEnd.toISOString());
    });
  });

  // ── Addon limit merging ────────────────────────────────────────────────────

  describe('recalculate — addon features', () => {
    it('adds addon limit to plan limit', async () => {
      const org = await seedOrg(dataSource, 'addon-limit-org');
      const plan = await seedPlan(dataSource, 'addon-limit-plan');
      const addon = await seedAddon(dataSource, 'extra-calls');
      const feat = await seedFeature(dataSource, 'api-calls');
      await seedPlanFeature(dataSource, plan, feat, 500);
      await seedAddonFeature(dataSource, addon, feat, 200);
      const sub = await seedSubscription(dataSource, org, plan);
      await attachAddon(dataSource, sub, addon, 2); // quantity=2 → 200*2=400 extra

      const [row] = await snapshotService.recalculate(org.id);

      expect(row.effectiveLimit).toBe(900); // 500 + 200*2
      expect(row.sourceType).toBe(EntitlementSourceType.Mixed);
    });

    it('adds a feature not in plan when addon provides it', async () => {
      const org = await seedOrg(dataSource, 'addon-only-org');
      const plan = await seedPlan(dataSource, 'addon-only-plan');
      const addon = await seedAddon(dataSource, 'sso-addon');
      const feat = await seedFeature(dataSource, 'sso', MeterType.Boolean);
      await seedAddonFeature(dataSource, addon, feat, null);
      const sub = await seedSubscription(dataSource, org, plan);
      await attachAddon(dataSource, sub, addon);

      const rows = await snapshotService.recalculate(org.id);

      expect(rows).toHaveLength(1);
      expect(rows[0].featureCode).toBe('sso');
      expect(rows[0].sourceType).toBe(EntitlementSourceType.Addon);
    });
  });

  // ── Override precedence ────────────────────────────────────────────────────

  describe('recalculate — overrides', () => {
    it('override force-disables a plan feature in the snapshot', async () => {
      const org = await seedOrg(dataSource, 'disable-org');
      const plan = await seedPlan(dataSource, 'disable-plan');
      const feat = await seedFeature(dataSource, 'reports');
      await seedPlanFeature(dataSource, plan, feat, 100);
      await seedSubscription(dataSource, org, plan);
      await seedOverride(dataSource, org, feat, false);

      const [row] = await snapshotService.recalculate(org.id);

      expect(row.isEnabled).toBe(false);
    });

    it('override replaces computed limit with limitOverride', async () => {
      const org = await seedOrg(dataSource, 'limit-override-org');
      const plan = await seedPlan(dataSource, 'limit-override-plan');
      const feat = await seedFeature(dataSource, 'storage', MeterType.Storage);
      await seedPlanFeature(dataSource, plan, feat, 10);
      await seedSubscription(dataSource, org, plan);
      await seedOverride(dataSource, org, feat, true, 9999);

      const [row] = await snapshotService.recalculate(org.id);

      expect(row.effectiveLimit).toBe(9999);
      expect(row.sourceType).toBe(EntitlementSourceType.Mixed);
    });

    it('override grants a feature not in plan or addons', async () => {
      const org = await seedOrg(dataSource, 'grant-org');
      const plan = await seedPlan(dataSource, 'grant-plan');
      const feat = await seedFeature(dataSource, 'white-label', MeterType.Boolean);
      await seedSubscription(dataSource, org, plan);
      await seedOverride(dataSource, org, feat, true);

      const rows = await snapshotService.recalculate(org.id);

      expect(rows).toHaveLength(1);
      expect(rows[0].featureCode).toBe('white-label');
      expect(rows[0].sourceType).toBe(EntitlementSourceType.Override);
    });
  });

  // ── Org scoping ────────────────────────────────────────────────────────────

  describe('recalculate — org scoping', () => {
    it('does not include features from another org\'s subscription', async () => {
      const plan = await seedPlan(dataSource, 'shared-plan');
      const feat1 = await seedFeature(dataSource, 'org-a-feature');
      const feat2 = await seedFeature(dataSource, 'org-b-feature');
      await seedPlanFeature(dataSource, plan, feat1, 100);
      await seedPlanFeature(dataSource, plan, feat2, 200);

      const orgA = await seedOrg(dataSource, 'org-a');
      const orgB = await seedOrg(dataSource, 'org-b');
      await seedSubscription(dataSource, orgA, plan);
      await seedSubscription(dataSource, orgB, plan);

      const rowsA = await snapshotService.recalculate(orgA.id);
      const rowsB = await snapshotService.recalculate(orgB.id);

      // Both orgs get both features (same plan), but each snapshot is scoped to its org
      expect(rowsA.every((r) => r.organizationId === orgA.id)).toBe(true);
      expect(rowsB.every((r) => r.organizationId === orgB.id)).toBe(true);

      // Overrides from org A do not affect org B
      const overrideFeat = await seedFeature(dataSource, 'scoped-feature');
      await seedPlanFeature(dataSource, plan, overrideFeat, 50);
      await seedOverride(dataSource, orgA, overrideFeat, false);

      await snapshotService.recalculate(orgA.id);
      await snapshotService.recalculate(orgB.id);

      const orgAOverridden = await entitlementRepo.findOne({
        where: { organizationId: orgA.id, featureCode: 'scoped-feature' },
      });
      const orgBRow = await entitlementRepo.findOne({
        where: { organizationId: orgB.id, featureCode: 'scoped-feature' },
      });

      expect(orgAOverridden?.isEnabled).toBe(false); // org A: disabled by override
      expect(orgBRow?.isEnabled).toBe(true);          // org B: unaffected
    });
  });

  // ── Stale row cleanup ──────────────────────────────────────────────────────

  describe('recalculate — stale cleanup', () => {
    it('removes snapshot rows for features no longer entitled', async () => {
      const org = await seedOrg(dataSource, 'stale-org');
      const plan = await seedPlan(dataSource, 'stale-plan');
      const feat = await seedFeature(dataSource, 'soon-removed');
      const pf = await seedPlanFeature(dataSource, plan, feat, 100);
      await seedSubscription(dataSource, org, plan);

      // First recalculate — snapshot has 1 row
      await snapshotService.recalculate(org.id);
      let rows = await entitlementRepo.find({ where: { organizationId: org.id } });
      expect(rows).toHaveLength(1);

      // Remove the plan feature
      await dataSource.getRepository(PlanFeature).delete(pf.id);

      // Second recalculate — stale row should be gone
      await snapshotService.recalculate(org.id);
      rows = await entitlementRepo.find({ where: { organizationId: org.id } });
      expect(rows).toHaveLength(0);
    });
  });

  // ── Access decisions ───────────────────────────────────────────────────────

  describe('access check', () => {
    it('allows access for a feature within the plan limit', async () => {
      const org = await seedOrg(dataSource, 'check-allow-org');
      const plan = await seedPlan(dataSource, 'check-allow-plan');
      const feat = await seedFeature(dataSource, 'api-calls');
      await seedPlanFeature(dataSource, plan, feat, 1000);
      await seedSubscription(dataSource, org, plan);
      await snapshotService.recalculate(org.id);

      const result = await accessService.check(org.id, { featureCode: 'api-calls', requestedQuantity: 500 });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('quota_available');
      expect(result.limit).toBe(1000);
    });

    it('denies access when requestedQuantity exceeds plan limit', async () => {
      const org = await seedOrg(dataSource, 'check-deny-org');
      const plan = await seedPlan(dataSource, 'check-deny-plan');
      const feat = await seedFeature(dataSource, 'api-calls');
      await seedPlanFeature(dataSource, plan, feat, 100);
      await seedSubscription(dataSource, org, plan);
      await snapshotService.recalculate(org.id);

      const result = await accessService.check(org.id, { featureCode: 'api-calls', requestedQuantity: 101 });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('quota_exceeded');
    });

    it('denies access for unknown feature code', async () => {
      const org = await seedOrg(dataSource, 'check-unknown-org');
      const plan = await seedPlan(dataSource, 'check-unknown-plan');
      await seedSubscription(dataSource, org, plan);
      await snapshotService.recalculate(org.id);

      const result = await accessService.check(org.id, { featureCode: 'not-a-feature' });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('feature_not_included');
    });

    it('denies access for feature disabled by override', async () => {
      const org = await seedOrg(dataSource, 'check-disabled-org');
      const plan = await seedPlan(dataSource, 'check-disabled-plan');
      const feat = await seedFeature(dataSource, 'export-pdf', MeterType.Boolean);
      await seedPlanFeature(dataSource, plan, feat, null);
      await seedSubscription(dataSource, org, plan);
      await seedOverride(dataSource, org, feat, false);
      await snapshotService.recalculate(org.id);

      const result = await accessService.check(org.id, { featureCode: 'export-pdf' });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('feature_disabled');
    });

    it('allows unlimited access when effectiveLimit is null', async () => {
      const org = await seedOrg(dataSource, 'unlimited-org');
      const plan = await seedPlan(dataSource, 'unlimited-plan');
      const feat = await seedFeature(dataSource, 'storage', MeterType.Storage);
      await seedPlanFeature(dataSource, plan, feat, null);
      await seedSubscription(dataSource, org, plan);
      await snapshotService.recalculate(org.id);

      const result = await accessService.check(org.id, { featureCode: 'storage', requestedQuantity: 999999 });

      expect(result.allowed).toBe(true);
      expect(result.limit).toBeNull();
    });
  });
});
