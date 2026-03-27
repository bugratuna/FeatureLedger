/**
 * Describes which billing source(s) granted a feature to the org.
 * Used in snapshot rows and API responses for auditability.
 */
export enum EntitlementSourceType {
  /** Feature comes from the subscription plan only. */
  Plan = 'plan',

  /** Feature comes from one or more addons but is not in the base plan. */
  Addon = 'addon',

  /** Feature is not in the plan or any addon — an override granted it explicitly. */
  Override = 'override',

  /** Feature comes from a combination of plan, addons, and/or an override. */
  Mixed = 'mixed',
}
