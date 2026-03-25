import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';

import { Membership } from '../../modules/memberships/entities/membership.entity';
import { ErrorCode } from '../constants/error-codes';
import { AppException } from '../exceptions/app.exception';

/**
 * Verifies that the authenticated user is a member of the organization identified
 * by the :orgId route parameter. Attaches the membership record to req.membership
 * so downstream guards (RolesGuard) and services can use it without another query.
 *
 * SECURITY NOTE: We deliberately resolve org membership from the database rather
 * than trusting any org context in the JWT. A token that says "I'm in org X" could
 * be stale or forged. The DB is the source of truth.
 *
 * Platform admins (req.user.isPlatformAdmin = true) bypass the membership check —
 * they can operate on any organization for platform management purposes.
 *
 * Must run AFTER JwtAuthGuard (depends on req.user).
 */
@Injectable()
export class OrganizationMemberGuard implements CanActivate {
  constructor(
    @InjectRepository(Membership)
    private readonly membershipRepo: Repository<Membership>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new AppException(ErrorCode.AUTH_TOKEN_INVALID, 'Not authenticated', 401);
    }

    // Platform admins can access any organization
    if (user.isPlatformAdmin) {
      return true;
    }

    const orgId = request.params['orgId'];
    if (!orgId) {
      // Guard used on a route without :orgId param — configuration error
      throw new AppException(ErrorCode.INTERNAL_ERROR, 'Organization context missing', 500);
    }

    const membership = await this.membershipRepo.findOne({
      where: { organizationId: orgId, userId: user.id },
    });

    if (!membership) {
      throw new AppException(
        ErrorCode.FORBIDDEN_ORGANIZATION_ACCESS,
        'Access to this organization is not permitted',
        403,
      );
    }

    request.membership = {
      id: membership.id,
      organizationId: membership.organizationId,
      userId: membership.userId,
      role: membership.role,
    };

    return true;
  }
}
