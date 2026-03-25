import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { OrganizationMemberGuard } from './organization-member.guard';
import { Membership } from '../../modules/memberships/entities/membership.entity';
import { MembershipRole } from '../../modules/memberships/enums/membership-role.enum';
import { ErrorCode } from '../constants/error-codes';

function buildContext(overrides: {
  user?: Record<string, unknown> | null;
  params?: Record<string, string>;
}): ExecutionContext {
  const request = {
    user: overrides.user ?? { id: 'user-1', email: 'u@example.com', isPlatformAdmin: false },
    params: overrides.params ?? { orgId: 'org-1' },
    membership: undefined as unknown,
  };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;
}

function makeMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-1',
    role: MembershipRole.Admin,
    invitedByUserId: null,
    joinedAt: new Date(),
    organization: {} as never,
    user: {} as never,
    ...overrides,
  } as Membership;
}

describe('OrganizationMemberGuard', () => {
  let guard: OrganizationMemberGuard;
  let membershipRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    membershipRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationMemberGuard,
        { provide: getRepositoryToken(Membership), useValue: membershipRepo },
      ],
    }).compile();

    guard = module.get(OrganizationMemberGuard);
  });

  it('allows a user with an active membership', async () => {
    membershipRepo.findOne.mockResolvedValue(makeMembership());
    const ctx = buildContext({});
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('attaches the membership to req.membership', async () => {
    const membership = makeMembership({ role: MembershipRole.Billing });
    membershipRepo.findOne.mockResolvedValue(membership);

    const request = {
      user: { id: 'user-1', email: 'u@example.com', isPlatformAdmin: false },
      params: { orgId: 'org-1' },
      membership: undefined as unknown,
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await guard.canActivate(ctx);

    expect(request.membership).toMatchObject({
      organizationId: 'org-1',
      userId: 'user-1',
      role: MembershipRole.Billing,
    });
  });

  it('throws FORBIDDEN_ORGANIZATION_ACCESS when user has no membership', async () => {
    membershipRepo.findOne.mockResolvedValue(null);
    const ctx = buildContext({});

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      errorCode: ErrorCode.FORBIDDEN_ORGANIZATION_ACCESS,
    });
  });

  it('allows platform admins without checking membership', async () => {
    const ctx = buildContext({
      user: { id: 'admin-1', email: 'admin@example.com', isPlatformAdmin: true },
    });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(membershipRepo.findOne).not.toHaveBeenCalled();
  });
});
