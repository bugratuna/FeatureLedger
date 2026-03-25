import { MembershipRole } from '../../modules/memberships/enums/membership-role.enum';

/**
 * Shape of the decoded JWT access token payload.
 * Kept intentionally minimal — org context is resolved per-request, not embedded in the token.
 */
export interface JwtAccessPayload {
  /** User ID (UUID) */
  sub: string;
  email: string;
  isPlatformAdmin: boolean;
  iat?: number;
  exp?: number;
}

/**
 * Attached to req.user by JwtAuthGuard after token verification.
 * Downstream code (guards, controllers, services) reads from here.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  isPlatformAdmin: boolean;
}

/**
 * Attached to req.membership by OrganizationMemberGuard.
 * Guards and controllers can read this without an extra DB round-trip.
 */
export interface ResolvedMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
}

// Extend Express Request with our custom properties
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
      user?: AuthenticatedUser;
      membership?: ResolvedMembership;
    }
  }
}
