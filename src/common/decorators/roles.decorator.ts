import { SetMetadata } from '@nestjs/common';

import { MembershipRole } from '../../modules/memberships/enums/membership-role.enum';

export const ROLES_KEY = 'roles';

/**
 * Declares the minimum required organization role for a route.
 * Evaluated by RolesGuard. The role hierarchy is: owner > admin > billing > analyst > integration.
 * Specifying a role grants access to that role and all roles above it.
 *
 * @example
 * @Roles(MembershipRole.Admin)  // owner and admin can access; billing, analyst, integration cannot
 */
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles);
