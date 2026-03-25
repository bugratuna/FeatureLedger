/**
 * Defines what happens when a tenant exceeds the includedLimit for a feature.
 *
 * - deny:           reject usage events / block access above the limit (default)
 * - soft_limit:     allow usage but log and surface a warning via webhook
 * - allow_and_flag: allow usage, flag for billing review (billable overage)
 */
export enum OveragePolicy {
  Deny = 'deny',
  SoftLimit = 'soft_limit',
  AllowAndFlag = 'allow_and_flag',
}
