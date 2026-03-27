export enum SubscriptionStatus {
  Trialing = 'trialing',
  Active = 'active',
  PastDue = 'past_due',
  Canceled = 'canceled',
}

export const ACTIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.Trialing,
  SubscriptionStatus.Active,
];
