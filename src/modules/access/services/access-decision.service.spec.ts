/**
 * Unit tests for AccessDecisionService.check().
 *
 * Tests the access decision logic against mocked OrganizationEntitlement snapshot rows.
 * Covers: allowed/denied decisions, boolean vs limit-based features, unlimited limits,
 * explicitly disabled features, and unknown features.
 *
 * Simulation tests are integration-level since they require multiple repos and resolver.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AccessDecisionService } from './access-decision.service';
import { AddonFeature } from '../../catalog/entities/addon-feature.entity';
import { Feature } from '../../catalog/entities/feature.entity';
import { PlanFeature } from '../../catalog/entities/plan-feature.entity';
import { MeterType } from '../../catalog/enums/meter-type.enum';
import { OveragePolicy } from '../../catalog/enums/overage-policy.enum';
import { OrganizationEntitlement } from '../../entitlements/entities/organization-entitlement.entity';
import { OrganizationFeatureOverride } from '../../entitlements/entities/organization-feature-override.entity';
import { EntitlementResolverService } from '../../entitlements/services/entitlement-resolver.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';

// ── Mock factory ───────────────────────────────────────────────────────────────

const makeRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
});

function makeSnapshot(overrides: Partial<OrganizationEntitlement> = {}): OrganizationEntitlement {
  return Object.assign(new OrganizationEntitlement(), {
    id: 'ent-1',
    organizationId: 'org-1',
    featureId: 'feat-1',
    featureCode: 'api-calls',
    featureName: 'API Calls',
    meterType: MeterType.Usage,
    isEnabled: true,
    effectiveLimit: 1000,
    overagePolicy: OveragePolicy.Deny,
    billingPeriodStart: new Date('2025-01-01'),
    billingPeriodEnd: new Date('2025-02-01'),
    recalculatedAt: new Date(),
    ...overrides,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AccessDecisionService.check()', () => {
  let service: AccessDecisionService;
  let entitlementRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    entitlementRepo = makeRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessDecisionService,
        { provide: getRepositoryToken(OrganizationEntitlement), useValue: entitlementRepo },
        { provide: getRepositoryToken(Feature), useValue: makeRepo() },
        { provide: getRepositoryToken(PlanFeature), useValue: makeRepo() },
        { provide: getRepositoryToken(AddonFeature), useValue: makeRepo() },
        { provide: getRepositoryToken(OrganizationFeatureOverride), useValue: makeRepo() },
        {
          provide: SubscriptionsService,
          useValue: { findCurrent: jest.fn() },
        },
        {
          provide: EntitlementResolverService,
          useValue: { merge: jest.fn() },
        },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get(AccessDecisionService);
  });

  // ── Feature not found in snapshot ────────────────────────────────────────────

  it('denies with feature_not_included when snapshot row is missing', async () => {
    entitlementRepo.findOne.mockResolvedValue(null);

    const result = await service.check('org-1', { featureCode: 'unknown-feature' });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('feature_not_included');
    expect(result.featureCode).toBe('unknown-feature');
    expect(result.limit).toBeNull();
    expect(result.consumed).toBeNull();
    expect(result.remaining).toBeNull();
  });

  // ── Explicitly disabled by override ──────────────────────────────────────────

  it('denies with feature_disabled when snapshot row has isEnabled=false', async () => {
    entitlementRepo.findOne.mockResolvedValue(makeSnapshot({ isEnabled: false, effectiveLimit: 100 }));

    const result = await service.check('org-1', { featureCode: 'api-calls' });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('feature_disabled');
    expect(result.limit).toBe(100);
  });

  // ── Boolean features ──────────────────────────────────────────────────────────

  it('allows boolean feature when isEnabled=true (ignores requestedQuantity)', async () => {
    entitlementRepo.findOne.mockResolvedValue(
      makeSnapshot({ meterType: MeterType.Boolean, effectiveLimit: null }),
    );

    const result = await service.check('org-1', {
      featureCode: 'sso',
      requestedQuantity: 999, // ignored for boolean
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('feature_included');
    expect(result.limit).toBeNull();
  });

  // ── Limit-based: unlimited ────────────────────────────────────────────────────

  it('allows limit-based feature with null effectiveLimit (unlimited)', async () => {
    entitlementRepo.findOne.mockResolvedValue(makeSnapshot({ effectiveLimit: null }));

    const result = await service.check('org-1', { featureCode: 'api-calls', requestedQuantity: 999999 });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('quota_available');
    expect(result.limit).toBeNull();
  });

  // ── Limit-based: within limit ─────────────────────────────────────────────────

  it('allows when requestedQuantity <= effectiveLimit', async () => {
    entitlementRepo.findOne.mockResolvedValue(makeSnapshot({ effectiveLimit: 1000 }));

    const result = await service.check('org-1', { featureCode: 'api-calls', requestedQuantity: 1000 });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('quota_available');
    expect(result.limit).toBe(1000);
  });

  it('defaults requestedQuantity to 1 when not provided', async () => {
    entitlementRepo.findOne.mockResolvedValue(makeSnapshot({ effectiveLimit: 5 }));

    const result = await service.check('org-1', { featureCode: 'api-calls' });

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(5);
  });

  // ── Limit-based: over limit ───────────────────────────────────────────────────

  it('denies with quota_exceeded when requestedQuantity > effectiveLimit', async () => {
    entitlementRepo.findOne.mockResolvedValue(makeSnapshot({ effectiveLimit: 100 }));

    const result = await service.check('org-1', { featureCode: 'api-calls', requestedQuantity: 101 });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('quota_exceeded');
    expect(result.limit).toBe(100);
  });

  it('denies with quota_exceeded when requestedQuantity is exactly one over', async () => {
    entitlementRepo.findOne.mockResolvedValue(makeSnapshot({ effectiveLimit: 10 }));

    const result = await service.check('org-1', { featureCode: 'api-calls', requestedQuantity: 11 });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('quota_exceeded');
  });

  // ── Phase 4 placeholders ──────────────────────────────────────────────────────

  it('always returns consumed=null and remaining=null (Phase 4 placeholders)', async () => {
    entitlementRepo.findOne.mockResolvedValue(makeSnapshot({ effectiveLimit: 100 }));

    const result = await service.check('org-1', { featureCode: 'api-calls', requestedQuantity: 1 });

    expect(result.consumed).toBeNull();
    expect(result.remaining).toBeNull();
  });

  // ── Org scoping ───────────────────────────────────────────────────────────────

  it('passes organizationId and featureCode to the repo lookup', async () => {
    entitlementRepo.findOne.mockResolvedValue(null);

    await service.check('my-org', { featureCode: 'my-feature' });

    expect(entitlementRepo.findOne).toHaveBeenCalledWith({
      where: { organizationId: 'my-org', featureCode: 'my-feature' },
    });
  });
});
