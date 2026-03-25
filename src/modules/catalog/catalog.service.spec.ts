import { ConflictException, NotFoundException } from '@common/exceptions/app.exception';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CatalogService } from './catalog.service';
import { AddonFeature } from './entities/addon-feature.entity';
import { Addon } from './entities/addon.entity';
import { Feature } from './entities/feature.entity';
import { PlanFeature } from './entities/plan-feature.entity';
import { Plan } from './entities/plan.entity';
import { MeterType } from './enums/meter-type.enum';
import { OveragePolicy } from './enums/overage-policy.enum';

const makeRepo = <T>(overrides: Partial<Record<keyof T, jest.Mock>> = {}) => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  ...overrides,
});

describe('CatalogService', () => {
  let service: CatalogService;
  let featureRepo: ReturnType<typeof makeRepo>;
  let planRepo: ReturnType<typeof makeRepo>;
  let planFeatureRepo: ReturnType<typeof makeRepo>;
  let addonRepo: ReturnType<typeof makeRepo>;
  let addonFeatureRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    featureRepo = makeRepo();
    planRepo = makeRepo();
    planFeatureRepo = makeRepo();
    addonRepo = makeRepo();
    addonFeatureRepo = makeRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: getRepositoryToken(Feature), useValue: featureRepo },
        { provide: getRepositoryToken(Plan), useValue: planRepo },
        { provide: getRepositoryToken(PlanFeature), useValue: planFeatureRepo },
        { provide: getRepositoryToken(Addon), useValue: addonRepo },
        { provide: getRepositoryToken(AddonFeature), useValue: addonFeatureRepo },
      ],
    }).compile();

    service = module.get(CatalogService);
  });

  // ─── Feature code normalization ──────────────────────────────────────────

  describe('normalizeCode', () => {
    it('lowercases the code', () => {
      expect(service.normalizeCode('API_Calls')).toBe('api_calls');
    });

    it('converts spaces to hyphens', () => {
      expect(service.normalizeCode('export pdf')).toBe('export-pdf');
    });

    it('strips leading and trailing hyphens', () => {
      expect(service.normalizeCode('-feature-')).toBe('feature');
    });

    it('preserves underscores', () => {
      expect(service.normalizeCode('api_rate_limit')).toBe('api_rate_limit');
    });
  });

  // ─── Slug derivation ─────────────────────────────────────────────────────

  describe('deriveSlug', () => {
    it('lowercases and kebab-cases a plain name', () => {
      expect(service.deriveSlug('Pro Plan')).toBe('pro-plan');
    });

    it('strips special characters', () => {
      expect(service.deriveSlug('Pro Plan!')).toBe('pro-plan');
    });

    it('collapses multiple separators', () => {
      expect(service.deriveSlug('Pro  --  Plan')).toBe('pro-plan');
    });

    it('truncates to 100 characters', () => {
      const long = 'a'.repeat(120);
      expect(service.deriveSlug(long)).toHaveLength(100);
    });
  });

  // ─── Feature: duplicate code rejection ───────────────────────────────────

  describe('createFeature', () => {
    it('throws ConflictException when a feature with the same code exists', async () => {
      featureRepo.findOne.mockResolvedValue({ id: 'existing-id', code: 'api-calls' });

      await expect(
        service.createFeature({ code: 'api-calls', name: 'API Calls', meterType: MeterType.Usage }),
      ).rejects.toThrow(ConflictException);
    });

    it('normalizes the code before checking for duplicates', async () => {
      featureRepo.findOne.mockResolvedValue(null);
      const saved = { id: 'new-id', code: 'api-calls' };
      featureRepo.create.mockReturnValue(saved);
      featureRepo.save.mockResolvedValue(saved);

      await service.createFeature({ code: 'API_CALLS', name: 'API Calls', meterType: MeterType.Usage });

      expect(featureRepo.findOne).toHaveBeenCalledWith({ where: { code: 'api_calls' } });
    });

    it('saves the feature when no conflict exists', async () => {
      featureRepo.findOne.mockResolvedValue(null);
      const saved = { id: 'new-id', code: 'seats', name: 'Seats', meterType: MeterType.Seats };
      featureRepo.create.mockReturnValue(saved);
      featureRepo.save.mockResolvedValue(saved);

      const result = await service.createFeature({
        code: 'seats',
        name: 'Seats',
        meterType: MeterType.Seats,
      });

      expect(result).toEqual(saved);
      expect(featureRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Plan: duplicate slug rejection ──────────────────────────────────────

  describe('createPlan', () => {
    it('throws ConflictException when a plan with the same slug exists', async () => {
      planRepo.findOne.mockResolvedValue({ id: 'existing-id', slug: 'pro-plan' });

      await expect(service.createPlan({ name: 'Pro Plan' })).rejects.toThrow(ConflictException);
    });

    it('derives the slug from name and saves the plan', async () => {
      planRepo.findOne.mockResolvedValue(null);
      const saved = { id: 'new-id', slug: 'starter', name: 'Starter', isActive: true };
      planRepo.create.mockReturnValue(saved);
      planRepo.save.mockResolvedValue(saved);

      const result = await service.createPlan({ name: 'Starter' });

      expect(planRepo.findOne).toHaveBeenCalledWith({ where: { slug: 'starter' } });
      expect(result).toEqual(saved);
    });

    it('defaults isActive to true when not provided', async () => {
      planRepo.findOne.mockResolvedValue(null);
      const plan = { id: 'id', slug: 'basic', name: 'Basic', isActive: true };
      planRepo.create.mockReturnValue(plan);
      planRepo.save.mockResolvedValue(plan);

      await service.createPlan({ name: 'Basic' });

      expect(planRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });
  });

  // ─── PlanFeature: duplicate mapping rejection ─────────────────────────────

  describe('assignFeatureToPlan', () => {
    const planId = 'plan-uuid';
    const featureId = 'feature-uuid';

    beforeEach(() => {
      planRepo.findOne.mockResolvedValue({ id: planId });
      featureRepo.findOne.mockResolvedValue({ id: featureId });
    });

    it('throws ConflictException when the mapping already exists', async () => {
      planFeatureRepo.findOne.mockResolvedValue({ id: 'mapping-id', planId, featureId });

      await expect(
        service.assignFeatureToPlan(planId, { featureId }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates the mapping with Deny as default overagePolicy', async () => {
      planFeatureRepo.findOne.mockResolvedValue(null);
      const mapping = { id: 'm-id', planId, featureId, overagePolicy: OveragePolicy.Deny, includedLimit: null };
      planFeatureRepo.create.mockReturnValue(mapping);
      planFeatureRepo.save.mockResolvedValue(mapping);

      const result = await service.assignFeatureToPlan(planId, { featureId });

      expect(planFeatureRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ overagePolicy: OveragePolicy.Deny }),
      );
      expect(result).toEqual(mapping);
    });

    it('respects a provided overagePolicy', async () => {
      planFeatureRepo.findOne.mockResolvedValue(null);
      const mapping = { id: 'm-id', planId, featureId, overagePolicy: OveragePolicy.AllowAndFlag };
      planFeatureRepo.create.mockReturnValue(mapping);
      planFeatureRepo.save.mockResolvedValue(mapping);

      await service.assignFeatureToPlan(planId, {
        featureId,
        overagePolicy: OveragePolicy.AllowAndFlag,
      });

      expect(planFeatureRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ overagePolicy: OveragePolicy.AllowAndFlag }),
      );
    });

    it('throws NotFoundException when the plan does not exist', async () => {
      planRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assignFeatureToPlan('bad-plan-id', { featureId }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the feature does not exist', async () => {
      featureRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assignFeatureToPlan(planId, { featureId: 'bad-feature-id' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── AddonFeature: duplicate mapping rejection ────────────────────────────

  describe('assignFeatureToAddon', () => {
    const addonId = 'addon-uuid';
    const featureId = 'feature-uuid';

    beforeEach(() => {
      addonRepo.findOne.mockResolvedValue({ id: addonId });
      featureRepo.findOne.mockResolvedValue({ id: featureId });
    });

    it('throws ConflictException when the mapping already exists', async () => {
      addonFeatureRepo.findOne.mockResolvedValue({ id: 'mapping-id', addonId, featureId });

      await expect(
        service.assignFeatureToAddon(addonId, { featureId }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates the mapping with default Deny policy when no policy provided', async () => {
      addonFeatureRepo.findOne.mockResolvedValue(null);
      const mapping = { id: 'm-id', addonId, featureId, overagePolicy: OveragePolicy.Deny };
      addonFeatureRepo.create.mockReturnValue(mapping);
      addonFeatureRepo.save.mockResolvedValue(mapping);

      await service.assignFeatureToAddon(addonId, { featureId });

      expect(addonFeatureRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ overagePolicy: OveragePolicy.Deny }),
      );
    });
  });

  // ─── Addon: duplicate slug rejection ─────────────────────────────────────

  describe('createAddon', () => {
    it('throws ConflictException when an addon with the same slug exists', async () => {
      addonRepo.findOne.mockResolvedValue({ id: 'existing-id', slug: 'extra-seats' });

      await expect(service.createAddon({ name: 'Extra Seats' })).rejects.toThrow(ConflictException);
    });

    it('saves the addon when no conflict exists', async () => {
      addonRepo.findOne.mockResolvedValue(null);
      const saved = { id: 'new-id', slug: 'extra-seats', name: 'Extra Seats' };
      addonRepo.create.mockReturnValue(saved);
      addonRepo.save.mockResolvedValue(saved);

      const result = await service.createAddon({ name: 'Extra Seats' });

      expect(result).toEqual(saved);
    });
  });
});
