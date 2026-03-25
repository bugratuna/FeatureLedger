import { hasMinimumRole, MembershipRole } from './membership-role.enum';

describe('hasMinimumRole', () => {
  it('owner satisfies every role requirement', () => {
    for (const role of Object.values(MembershipRole)) {
      expect(hasMinimumRole(MembershipRole.Owner, role)).toBe(true);
    }
  });

  it('integration only satisfies integration requirement', () => {
    expect(hasMinimumRole(MembershipRole.Integration, MembershipRole.Integration)).toBe(true);
    expect(hasMinimumRole(MembershipRole.Integration, MembershipRole.Analyst)).toBe(false);
    expect(hasMinimumRole(MembershipRole.Integration, MembershipRole.Billing)).toBe(false);
    expect(hasMinimumRole(MembershipRole.Integration, MembershipRole.Admin)).toBe(false);
    expect(hasMinimumRole(MembershipRole.Integration, MembershipRole.Owner)).toBe(false);
  });

  it('admin satisfies admin and below but not owner', () => {
    expect(hasMinimumRole(MembershipRole.Admin, MembershipRole.Owner)).toBe(false);
    expect(hasMinimumRole(MembershipRole.Admin, MembershipRole.Admin)).toBe(true);
    expect(hasMinimumRole(MembershipRole.Admin, MembershipRole.Billing)).toBe(true);
    expect(hasMinimumRole(MembershipRole.Admin, MembershipRole.Analyst)).toBe(true);
    expect(hasMinimumRole(MembershipRole.Admin, MembershipRole.Integration)).toBe(true);
  });
});
