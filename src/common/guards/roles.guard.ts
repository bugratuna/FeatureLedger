import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import {
  hasMinimumRole,
  MembershipRole,
} from '../../modules/memberships/enums/membership-role.enum';
import { ErrorCode } from '../constants/error-codes';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AppException } from '../exceptions/app.exception';

/**
 * Enforces minimum required organization role on a route.
 *
 * Reads the required role(s) from @Roles() metadata. The role with the
 * highest weight is treated as the minimum — i.e., @Roles(MembershipRole.Admin)
 * allows admins and owners.
 *
 * Must run AFTER OrganizationMemberGuard (depends on req.membership).
 * Platform admins (req.user.isPlatformAdmin) are granted all roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<MembershipRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    // No @Roles() annotation means the route only requires membership (handled by OrganizationMemberGuard)
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = ctx.switchToHttp().getRequest<Request>();

    // Platform admins bypass role checks
    if (request.user?.isPlatformAdmin) return true;

    const membership = request.membership;
    if (!membership) {
      throw new AppException(ErrorCode.FORBIDDEN_ORGANIZATION_ACCESS, 'No organization context', 403);
    }

    // The most permissive role in the list is the effective minimum
    const minimumRequired = requiredRoles.reduce((min, role) =>
      hasMinimumRole(role, min) ? min : role,
    );

    if (!hasMinimumRole(membership.role, minimumRequired)) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        `This action requires at least the '${minimumRequired}' role`,
        403,
      );
    }

    return true;
  }
}
