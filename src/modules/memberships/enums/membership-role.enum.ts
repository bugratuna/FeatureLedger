/**
 * Organization-level roles, ordered from highest to lowest privilege.
 * The numeric weight is used by RolesGuard to implement hierarchical access:
 * a role check for ADMIN grants access to OWNER as well (weight >= required weight).
 */
export enum MembershipRole {
  Owner = 'owner',
  Admin = 'admin',
  Billing = 'billing',
  Analyst = 'analyst',
  Integration = 'integration',
}

/**
 * Numeric weight for role hierarchy comparison.
 * Higher number = more privilege.
 */
export const ROLE_WEIGHT: Record<MembershipRole, number> = {
  [MembershipRole.Owner]: 50,
  [MembershipRole.Admin]: 40,
  [MembershipRole.Billing]: 30,
  [MembershipRole.Analyst]: 20,
  [MembershipRole.Integration]: 10,
};

/**
 * Returns true if the caller's role meets or exceeds the required minimum.
 */
export function hasMinimumRole(callerRole: MembershipRole, requiredRole: MembershipRole): boolean {
  return ROLE_WEIGHT[callerRole] >= ROLE_WEIGHT[requiredRole];
}
