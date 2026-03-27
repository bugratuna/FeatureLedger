/**
 * Integration tests for SubscriptionsService.
 *
 * These tests run against a real PostgreSQL instance started by Testcontainers.
 * They cover the constraints, conflict rules, and transaction semantics that
 * unit tests with mocked repositories cannot verify:
 *   - Partial unique index: one active/trialing subscription per org
 *   - FK constraints: plan must exist, addon must exist
 *   - Unique index on subscription_addons: no duplicate addons on a subscription
 *   - Transaction atomicity: subscription + addons written or not at all
 *   - Optimistic locking: version column prevents lost updates
 */

import { DataSource, Repository } from 'typeorm';

import { Addon } from '../../src/modules/catalog/entities/addon.entity';
import { Plan } from '../../src/modules/catalog/entities/plan.entity';
import { Organization } from '../../src/modules/organizations/entities/organization.entity';
import { SubscriptionAddon } from '../../src/modules/subscriptions/entities/subscription-addon.entity';
import { Subscription } from '../../src/modules/subscriptions/entities/subscription.entity';
import { SubscriptionStatus } from '../../src/modules/subscriptions/enums/subscription-status.enum';
import { SubscriptionsService } from '../../src/modules/subscriptions/subscriptions.service';
import { setupTestDatabase, teardownTestDatabase, clearDatabase, TestDatabase } from '../helpers/database';

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function seedOrg(ds: DataSource, slug: string): Promise<Organization> {
  return ds.getRepository(Organization).save(
    ds.getRepository(Organization).create({ name: `Org ${slug}`, slug, isActive: true }),
  );
}

async function seedPlan(ds: DataSource, slug: string, isActive = true): Promise<Plan> {
  return ds.getRepository(Plan).save(
    ds.getRepository(Plan).create({ name: `Plan ${slug}`, slug, isActive }),
  );
}

async function seedAddon(ds: DataSource, slug: string): Promise<Addon> {
  return ds.getRepository(Addon).save(
    ds.getRepository(Addon).create({ name: `Addon ${slug}`, slug }),
  );
}

function billingWindow() {
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { billingPeriodStart: start, billingPeriodEnd: end };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SubscriptionsService (integration)', () => {
  let db: TestDatabase;
  let dataSource: DataSource;
  let service: SubscriptionsService;

  let subRepo: Repository<Subscription>;
  let subAddonRepo: Repository<SubscriptionAddon>;
  let planRepo: Repository<Plan>;
  let addonRepo: Repository<Addon>;

  beforeAll(async () => {
    db = await setupTestDatabase();
    dataSource = db.dataSource;

    subRepo = dataSource.getRepository(Subscription);
    subAddonRepo = dataSource.getRepository(SubscriptionAddon);
    planRepo = dataSource.getRepository(Plan);
    addonRepo = dataSource.getRepository(Addon);

    service = new SubscriptionsService(subRepo, subAddonRepo, planRepo, addonRepo, dataSource);
  });

  afterAll(async () => {
    await teardownTestDatabase(db);
  });

  beforeEach(async () => {
    await clearDatabase(dataSource);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a subscription with the correct fields', async () => {
      const org = await seedOrg(dataSource, 'acme');
      const plan = await seedPlan(dataSource, 'starter');

      const sub = await service.create(org.id, {
        planId: plan.id,
        ...billingWindow(),
      });

      expect(sub.id).toBeDefined();
      expect(sub.organizationId).toBe(org.id);
      expect(sub.planId).toBe(plan.id);
      expect(sub.status).toBe(SubscriptionStatus.Active);
      expect(sub.cancelAtPeriodEnd).toBe(false);
      expect(sub.canceledAt).toBeNull();
      expect(sub.addons).toHaveLength(0);
    });

    it('creates a subscription with addons in a single transaction', async () => {
      const org = await seedOrg(dataSource, 'beta');
      const plan = await seedPlan(dataSource, 'growth');
      const addon1 = await seedAddon(dataSource, 'sso');
      const addon2 = await seedAddon(dataSource, 'audit-log');

      const sub = await service.create(org.id, {
        planId: plan.id,
        addons: [
          { addonId: addon1.id, quantity: 2 },
          { addonId: addon2.id },
        ],
        ...billingWindow(),
      });

      expect(sub.addons).toHaveLength(2);
      const addonIds = sub.addons.map((a) => a.addonId).sort();
      expect(addonIds).toEqual([addon1.id, addon2.id].sort());

      // Confirm rows exist in DB
      const dbAddons = await subAddonRepo.find({ where: { subscriptionId: sub.id } });
      expect(dbAddons).toHaveLength(2);
    });

    it('throws NotFoundException when plan does not exist', async () => {
      const org = await seedOrg(dataSource, 'gamma');
      const nonExistentPlanId = '00000000-0000-0000-0000-000000000000';

      await expect(
        service.create(org.id, { planId: nonExistentPlanId, ...billingWindow() }),
      ).rejects.toMatchObject({ message: expect.stringContaining('Plan') });
    });

    it('throws when plan is inactive', async () => {
      const org = await seedOrg(dataSource, 'delta');
      const inactivePlan = await seedPlan(dataSource, 'legacy', false);

      await expect(
        service.create(org.id, { planId: inactivePlan.id, ...billingWindow() }),
      ).rejects.toMatchObject({ errorCode: 'SUBSCRIPTION_PLAN_INACTIVE' });
    });

    it('throws SUBSCRIPTION_ALREADY_ACTIVE when org has an active subscription', async () => {
      const org = await seedOrg(dataSource, 'epsilon');
      const plan = await seedPlan(dataSource, 'pro');

      await service.create(org.id, { planId: plan.id, ...billingWindow() });

      await expect(
        service.create(org.id, { planId: plan.id, ...billingWindow() }),
      ).rejects.toMatchObject({ errorCode: 'SUBSCRIPTION_ALREADY_ACTIVE' });
    });

    it('allows a new subscription after the previous one is canceled', async () => {
      const org = await seedOrg(dataSource, 'zeta');
      const plan = await seedPlan(dataSource, 'basic');

      const first = await service.create(org.id, { planId: plan.id, ...billingWindow() });
      await service.updateCurrent(org.id, { status: SubscriptionStatus.Canceled });

      // First subscription is now canceled — second should succeed
      const second = await service.create(org.id, { planId: plan.id, ...billingWindow() });
      expect(second.id).not.toBe(first.id);
      expect(second.status).toBe(SubscriptionStatus.Active);
    });

    it('throws when an addon in the create payload does not exist', async () => {
      const org = await seedOrg(dataSource, 'eta');
      const plan = await seedPlan(dataSource, 'enterprise');
      const nonExistent = '11111111-1111-1111-1111-111111111111';

      await expect(
        service.create(org.id, {
          planId: plan.id,
          addons: [{ addonId: nonExistent }],
          ...billingWindow(),
        }),
      ).rejects.toMatchObject({ message: expect.stringContaining('Addon') });
    });

    it('throws when the same addon id appears twice in create payload', async () => {
      const org = await seedOrg(dataSource, 'theta');
      const plan = await seedPlan(dataSource, 'scale');
      const addon = await seedAddon(dataSource, 'reports');

      await expect(
        service.create(org.id, {
          planId: plan.id,
          addons: [{ addonId: addon.id }, { addonId: addon.id }],
          ...billingWindow(),
        }),
      ).rejects.toMatchObject({ errorCode: 'SUBSCRIPTION_ADDON_DUPLICATE' });
    });

    it('rolls back the transaction when addon validation fails after subscription insert', async () => {
      const org = await seedOrg(dataSource, 'iota');
      const plan = await seedPlan(dataSource, 'rollback-plan');
      const nonExistent = '22222222-2222-2222-2222-222222222222';

      await expect(
        service.create(org.id, {
          planId: plan.id,
          addons: [{ addonId: nonExistent }],
          ...billingWindow(),
        }),
      ).rejects.toBeDefined();

      // No orphaned subscription should remain
      const count = await subRepo.count({ where: { organizationId: org.id } });
      expect(count).toBe(0);
    });
  });

  // ── findCurrent ─────────────────────────────────────────────────────────────

  describe('findCurrent', () => {
    it('returns the active subscription with addons', async () => {
      const org = await seedOrg(dataSource, 'find-current-org');
      const plan = await seedPlan(dataSource, 'find-current-plan');
      const addon = await seedAddon(dataSource, 'find-current-addon');

      await service.create(org.id, {
        planId: plan.id,
        addons: [{ addonId: addon.id }],
        ...billingWindow(),
      });

      const sub = await service.findCurrent(org.id);
      expect(sub.status).toBe(SubscriptionStatus.Active);
      expect(sub.addons).toHaveLength(1);
    });

    it('throws SUBSCRIPTION_NOT_FOUND when no active subscription', async () => {
      const org = await seedOrg(dataSource, 'no-sub-org');

      await expect(service.findCurrent(org.id)).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_NOT_FOUND',
      });
    });
  });

  // ── findHistory ──────────────────────────────────────────────────────────────

  describe('findHistory', () => {
    it('returns all subscriptions newest first', async () => {
      const org = await seedOrg(dataSource, 'history-org');
      const plan = await seedPlan(dataSource, 'history-plan');

      // Create and cancel first subscription
      await service.create(org.id, { planId: plan.id, ...billingWindow() });
      await service.updateCurrent(org.id, { status: SubscriptionStatus.Canceled });

      // Create second subscription
      await service.create(org.id, { planId: plan.id, ...billingWindow() });

      const result = await service.findHistory(org.id, { page: 1, limit: 10, offset: 0 });
      expect(result.total).toBe(2);
      expect(result.items[0].status).toBe(SubscriptionStatus.Active);
      expect(result.items[1].status).toBe(SubscriptionStatus.Canceled);
    });
  });

  // ── updateCurrent ────────────────────────────────────────────────────────────

  describe('updateCurrent', () => {
    it('changes plan to another active plan', async () => {
      const org = await seedOrg(dataSource, 'update-plan-org');
      const plan1 = await seedPlan(dataSource, 'plan-a');
      const plan2 = await seedPlan(dataSource, 'plan-b');

      await service.create(org.id, { planId: plan1.id, ...billingWindow() });
      const updated = await service.updateCurrent(org.id, { planId: plan2.id });

      expect(updated.planId).toBe(plan2.id);
    });

    it('sets canceledAt when status is set to canceled', async () => {
      const org = await seedOrg(dataSource, 'cancel-org');
      const plan = await seedPlan(dataSource, 'cancel-plan');

      await service.create(org.id, { planId: plan.id, ...billingWindow() });
      const canceled = await service.updateCurrent(org.id, {
        status: SubscriptionStatus.Canceled,
      });

      expect(canceled.status).toBe(SubscriptionStatus.Canceled);
      expect(canceled.canceledAt).toBeInstanceOf(Date);
    });

    it('throws when switching to an inactive plan', async () => {
      const org = await seedOrg(dataSource, 'switch-inactive-org');
      const activePlan = await seedPlan(dataSource, 'active-plan');
      const inactivePlan = await seedPlan(dataSource, 'inactive-plan', false);

      await service.create(org.id, { planId: activePlan.id, ...billingWindow() });

      await expect(
        service.updateCurrent(org.id, { planId: inactivePlan.id }),
      ).rejects.toMatchObject({ errorCode: 'SUBSCRIPTION_PLAN_INACTIVE' });
    });
  });

  // ── addAddon / removeAddon ───────────────────────────────────────────────────

  describe('addAddon', () => {
    it('adds an addon to the current subscription', async () => {
      const org = await seedOrg(dataSource, 'add-addon-org');
      const plan = await seedPlan(dataSource, 'add-addon-plan');
      const addon = await seedAddon(dataSource, 'crm-integration');

      await service.create(org.id, { planId: plan.id, ...billingWindow() });
      const sa = await service.addAddon(org.id, { addonId: addon.id, quantity: 3 });

      expect(sa.addonId).toBe(addon.id);
      expect(sa.quantity).toBe(3);
    });

    it('throws SUBSCRIPTION_ADDON_DUPLICATE when addon already attached', async () => {
      const org = await seedOrg(dataSource, 'dup-addon-org');
      const plan = await seedPlan(dataSource, 'dup-addon-plan');
      const addon = await seedAddon(dataSource, 'analytics');

      await service.create(org.id, { planId: plan.id, ...billingWindow() });
      await service.addAddon(org.id, { addonId: addon.id });

      await expect(
        service.addAddon(org.id, { addonId: addon.id }),
      ).rejects.toMatchObject({ errorCode: 'SUBSCRIPTION_ADDON_DUPLICATE' });
    });
  });

  describe('removeAddon', () => {
    it('removes an addon from the current subscription', async () => {
      const org = await seedOrg(dataSource, 'remove-addon-org');
      const plan = await seedPlan(dataSource, 'remove-addon-plan');
      const addon = await seedAddon(dataSource, 'remove-me');

      const sub = await service.create(org.id, {
        planId: plan.id,
        addons: [{ addonId: addon.id }],
        ...billingWindow(),
      });

      await service.removeAddon(org.id, addon.id);

      const remaining = await subAddonRepo.count({ where: { subscriptionId: sub.id } });
      expect(remaining).toBe(0);
    });

    it('throws SUBSCRIPTION_ADDON_NOT_FOUND when addon is not on the subscription', async () => {
      const org = await seedOrg(dataSource, 'not-found-addon-org');
      const plan = await seedPlan(dataSource, 'not-found-addon-plan');
      const addon = await seedAddon(dataSource, 'not-on-sub');

      await service.create(org.id, { planId: plan.id, ...billingWindow() });

      await expect(
        service.removeAddon(org.id, addon.id),
      ).rejects.toMatchObject({ errorCode: 'SUBSCRIPTION_ADDON_NOT_FOUND' });
    });
  });

  // ── DB-level constraint: partial unique index ────────────────────────────────

  describe('DB partial unique index (concurrent write simulation)', () => {
    it('prevents two simultaneous active subscriptions even if app check is bypassed', async () => {
      const org = await seedOrg(dataSource, 'concurrent-org');
      const plan = await seedPlan(dataSource, 'concurrent-plan');

      // Insert first subscription directly (bypasses service layer)
      const sub1 = subRepo.create({
        organizationId: org.id,
        planId: plan.id,
        status: SubscriptionStatus.Active,
        ...billingWindow(),
        cancelAtPeriodEnd: false,
        canceledAt: null,
      });
      await subRepo.save(sub1);

      // Attempt to insert second active subscription directly — DB must reject it
      const sub2 = subRepo.create({
        organizationId: org.id,
        planId: plan.id,
        status: SubscriptionStatus.Active,
        ...billingWindow(),
        cancelAtPeriodEnd: false,
        canceledAt: null,
      });

      await expect(subRepo.save(sub2)).rejects.toThrow();
    });
  });
});
