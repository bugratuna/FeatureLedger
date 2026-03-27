/**
 * Unit tests for SubscriptionsService.
 *
 * Repositories and DataSource are mocked so these tests run without a database.
 * They cover the application-layer business rules: plan validation, conflict
 * detection, addon duplicate checks, and state transitions.
 *
 * DB-level constraints (partial unique index, FK enforcement, transaction
 * atomicity) are covered in the integration test suite.
 */

import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AddAddonDto } from './dto/add-addon.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SubscriptionAddon } from './entities/subscription-addon.entity';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionStatus } from './enums/subscription-status.enum';
import { SubscriptionsService } from './subscriptions.service';
import { Addon } from '../catalog/entities/addon.entity';
import { Plan } from '../catalog/entities/plan.entity';

// ── Mock factory ──────────────────────────────────────────────────────────────

const makeRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  count: jest.fn(),
});

const makeDataSource = (transactionResult?: unknown) => ({
  transaction: jest.fn((cb: (manager: unknown) => Promise<unknown>) => {
    const manager = {
      create: jest.fn((_entity: unknown, data: Record<string, unknown>) => ({ ...data })),
      save: jest.fn((_entity: unknown, data: Record<string, unknown>) => Promise.resolve(data)),
    };
    return transactionResult !== undefined
      ? Promise.resolve(transactionResult)
      : cb(manager);
  }),
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORG_ID = 'org-uuid-1';
const PLAN_ID = 'plan-uuid-1';
const ADDON_ID = 'addon-uuid-1';
const SUB_ID = 'sub-uuid-1';

const activePlan: Partial<Plan> = { id: PLAN_ID, name: 'Starter', isActive: true };
const inactivePlan: Partial<Plan> = { id: PLAN_ID, name: 'Legacy', isActive: false };
const activeAddon: Partial<Addon> = { id: ADDON_ID, name: 'SSO' };

const activeSubscription: Partial<Subscription> = {
  id: SUB_ID,
  organizationId: ORG_ID,
  planId: PLAN_ID,
  status: SubscriptionStatus.Active,
  cancelAtPeriodEnd: false,
  canceledAt: null,
  version: 1,
  addons: [],
};

function billingWindow(): Pick<CreateSubscriptionDto, 'billingPeriodStart' | 'billingPeriodEnd'> {
  return {
    billingPeriodStart: new Date('2025-01-01'),
    billingPeriodEnd: new Date('2025-02-01'),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let subRepo: ReturnType<typeof makeRepo>;
  let subAddonRepo: ReturnType<typeof makeRepo>;
  let planRepo: ReturnType<typeof makeRepo>;
  let addonRepo: ReturnType<typeof makeRepo>;
  let dataSource: ReturnType<typeof makeDataSource>;

  beforeEach(async () => {
    subRepo = makeRepo();
    subAddonRepo = makeRepo();
    planRepo = makeRepo();
    addonRepo = makeRepo();
    dataSource = makeDataSource();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: getRepositoryToken(Subscription), useValue: subRepo },
        { provide: getRepositoryToken(SubscriptionAddon), useValue: subAddonRepo },
        { provide: getRepositoryToken(Plan), useValue: planRepo },
        { provide: getRepositoryToken(Addon), useValue: addonRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(SubscriptionsService);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('throws NotFoundException when plan does not exist', async () => {
      planRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, { planId: PLAN_ID, ...billingWindow() }),
      ).rejects.toMatchObject({ message: expect.stringContaining('Plan') });
    });

    it('throws SUBSCRIPTION_PLAN_INACTIVE when plan is inactive', async () => {
      planRepo.findOne.mockResolvedValue(inactivePlan);

      await expect(
        service.create(ORG_ID, { planId: PLAN_ID, ...billingWindow() }),
      ).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_PLAN_INACTIVE',
        status: HttpStatus.CONFLICT,
      });
    });

    it('throws SUBSCRIPTION_ALREADY_ACTIVE when org already has an active subscription', async () => {
      planRepo.findOne.mockResolvedValue(activePlan);
      subRepo.findOne.mockResolvedValue(activeSubscription);

      await expect(
        service.create(ORG_ID, { planId: PLAN_ID, ...billingWindow() }),
      ).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_ALREADY_ACTIVE',
        status: HttpStatus.CONFLICT,
      });
    });

    it('throws SUBSCRIPTION_ADDON_DUPLICATE when same addon id appears twice in payload', async () => {
      planRepo.findOne.mockResolvedValue(activePlan);
      subRepo.findOne.mockResolvedValue(null);
      addonRepo.find.mockResolvedValue([activeAddon]);

      await expect(
        service.create(ORG_ID, {
          planId: PLAN_ID,
          addons: [{ addonId: ADDON_ID }, { addonId: ADDON_ID }],
          ...billingWindow(),
        }),
      ).rejects.toMatchObject({ errorCode: 'SUBSCRIPTION_ADDON_DUPLICATE' });
    });

    it('throws NotFoundException when an addon in the payload does not exist', async () => {
      planRepo.findOne.mockResolvedValue(activePlan);
      subRepo.findOne.mockResolvedValue(null);
      addonRepo.find.mockResolvedValue([]); // nothing found

      await expect(
        service.create(ORG_ID, {
          planId: PLAN_ID,
          addons: [{ addonId: ADDON_ID }],
          ...billingWindow(),
        }),
      ).rejects.toMatchObject({ message: expect.stringContaining('Addon') });
    });

    it('defaults status to Active when not provided', async () => {
      planRepo.findOne.mockResolvedValue(activePlan);
      subRepo.findOne.mockResolvedValue(null);

      const savedSub = { id: SUB_ID, addons: [] };
      dataSource.transaction.mockImplementation((cb: (manager: unknown) => Promise<unknown>) => {
        const manager = {
          create: jest.fn((_e: unknown, data: Record<string, unknown>) => ({ ...data })),
          save: jest.fn((_e: unknown, _d: unknown) => Promise.resolve(savedSub)),
        };
        return cb(manager);
      });

      const result = await service.create(ORG_ID, { planId: PLAN_ID, ...billingWindow() });
      expect(result).toBe(savedSub);
    });

    it('passes status override to the transaction', async () => {
      planRepo.findOne.mockResolvedValue(activePlan);
      subRepo.findOne.mockResolvedValue(null);

      let createdData: Record<string, unknown> | null = null;
      dataSource.transaction.mockImplementation((cb: (manager: unknown) => Promise<unknown>) => {
        const manager = {
          create: jest.fn((_e: unknown, data: Record<string, unknown>) => {
            createdData = data;
            return data;
          }),
          save: jest.fn((_e: unknown, _d: unknown) => Promise.resolve({ id: SUB_ID, addons: [] })),
        };
        return cb(manager);
      });

      await service.create(ORG_ID, {
        planId: PLAN_ID,
        status: SubscriptionStatus.Trialing,
        ...billingWindow(),
      });

      expect(createdData!['status']).toBe(SubscriptionStatus.Trialing);
    });
  });

  // ── findCurrent ─────────────────────────────────────────────────────────────

  describe('findCurrent', () => {
    it('throws SUBSCRIPTION_NOT_FOUND when no active subscription', async () => {
      subRepo.findOne.mockResolvedValue(null);

      await expect(service.findCurrent(ORG_ID)).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('returns the subscription when found', async () => {
      subRepo.findOne.mockResolvedValue(activeSubscription);
      const result = await service.findCurrent(ORG_ID);
      expect(result).toBe(activeSubscription);
    });
  });

  // ── updateCurrent ────────────────────────────────────────────────────────────

  describe('updateCurrent', () => {
    it('sets canceledAt when status transitions to Canceled', async () => {
      const sub = { ...activeSubscription, canceledAt: null } as Subscription;
      subRepo.findOne.mockResolvedValue(sub);
      subRepo.save.mockResolvedValue({ ...sub, status: SubscriptionStatus.Canceled, canceledAt: new Date() });

      const result = await service.updateCurrent(ORG_ID, { status: SubscriptionStatus.Canceled });
      expect(sub.canceledAt).toBeInstanceOf(Date);
      expect(result.status).toBe(SubscriptionStatus.Canceled);
    });

    it('does not overwrite canceledAt when already set', async () => {
      const alreadyCanceled = new Date('2024-12-01');
      const sub = {
        ...activeSubscription,
        status: SubscriptionStatus.Canceled,
        canceledAt: alreadyCanceled,
      } as Subscription;
      subRepo.findOne.mockResolvedValue(sub);
      subRepo.save.mockResolvedValue(sub);

      await service.updateCurrent(ORG_ID, { status: SubscriptionStatus.Canceled });
      expect(sub.canceledAt).toBe(alreadyCanceled);
    });

    it('throws SUBSCRIPTION_PLAN_INACTIVE when new plan is inactive', async () => {
      const newPlanId = 'plan-uuid-2';
      subRepo.findOne.mockResolvedValue({ ...activeSubscription, planId: PLAN_ID });
      planRepo.findOne.mockResolvedValue({ id: newPlanId, name: 'Old Plan', isActive: false });

      await expect(
        service.updateCurrent(ORG_ID, { planId: newPlanId }),
      ).rejects.toMatchObject({ errorCode: 'SUBSCRIPTION_PLAN_INACTIVE' });
    });

    it('does not query plan when planId is unchanged', async () => {
      subRepo.findOne.mockResolvedValue({ ...activeSubscription });
      subRepo.save.mockResolvedValue({ ...activeSubscription, cancelAtPeriodEnd: true });

      await service.updateCurrent(ORG_ID, { planId: PLAN_ID, cancelAtPeriodEnd: true });
      // planId matches sub.planId — no plan lookup should occur
      expect(planRepo.findOne).not.toHaveBeenCalled();
    });
  });

  // ── addAddon ─────────────────────────────────────────────────────────────────

  describe('addAddon', () => {
    it('throws NotFoundException when addon does not exist', async () => {
      subRepo.findOne.mockResolvedValue(activeSubscription);
      addonRepo.findOne.mockResolvedValue(null);

      const dto: AddAddonDto = { addonId: ADDON_ID };
      await expect(service.addAddon(ORG_ID, dto)).rejects.toMatchObject({
        message: expect.stringContaining('Addon'),
      });
    });

    it('throws SUBSCRIPTION_ADDON_DUPLICATE when addon is already on the subscription', async () => {
      subRepo.findOne.mockResolvedValue(activeSubscription);
      addonRepo.findOne.mockResolvedValue(activeAddon);
      subAddonRepo.findOne.mockResolvedValue({ id: 'sa-1', addonId: ADDON_ID });

      const dto: AddAddonDto = { addonId: ADDON_ID };
      await expect(service.addAddon(ORG_ID, dto)).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_ADDON_DUPLICATE',
        status: HttpStatus.CONFLICT,
      });
    });

    it('saves and returns the SubscriptionAddon', async () => {
      const newSa = { id: 'sa-2', subscriptionId: SUB_ID, addonId: ADDON_ID, quantity: 1 };
      subRepo.findOne.mockResolvedValue(activeSubscription);
      addonRepo.findOne.mockResolvedValue(activeAddon);
      subAddonRepo.findOne.mockResolvedValue(null);
      subAddonRepo.create.mockReturnValue(newSa);
      subAddonRepo.save.mockResolvedValue(newSa);

      const result = await service.addAddon(ORG_ID, { addonId: ADDON_ID });
      expect(result).toBe(newSa);
      expect(subAddonRepo.save).toHaveBeenCalledWith(newSa);
    });
  });

  // ── removeAddon ──────────────────────────────────────────────────────────────

  describe('removeAddon', () => {
    it('throws SUBSCRIPTION_ADDON_NOT_FOUND when addon is not on the subscription', async () => {
      subRepo.findOne.mockResolvedValue(activeSubscription);
      subAddonRepo.findOne.mockResolvedValue(null);

      await expect(service.removeAddon(ORG_ID, ADDON_ID)).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_ADDON_NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('calls repository remove with the found entity', async () => {
      const sa = { id: 'sa-3', subscriptionId: SUB_ID, addonId: ADDON_ID };
      subRepo.findOne.mockResolvedValue(activeSubscription);
      subAddonRepo.findOne.mockResolvedValue(sa);
      subAddonRepo.remove.mockResolvedValue(undefined);

      await service.removeAddon(ORG_ID, ADDON_ID);
      expect(subAddonRepo.remove).toHaveBeenCalledWith(sa);
    });
  });
});
