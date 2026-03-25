/**
 * Domain-level error codes surfaced in API error responses.
 * Using string constants (not numeric) keeps responses self-documenting
 * and stable across API versions regardless of ordering changes.
 */
export const ErrorCode = {
  // Auth
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_REUSED: 'AUTH_TOKEN_REUSED',
  AUTH_INSUFFICIENT_SCOPE: 'AUTH_INSUFFICIENT_SCOPE',

  // Authorization
  FORBIDDEN: 'FORBIDDEN',
  FORBIDDEN_ORGANIZATION_ACCESS: 'FORBIDDEN_ORGANIZATION_ACCESS',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',

  // Entitlements and access
  FEATURE_NOT_INCLUDED: 'FEATURE_NOT_INCLUDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  SEAT_LIMIT_REACHED: 'SEAT_LIMIT_REACHED',

  // Usage
  DUPLICATE_USAGE_EVENT: 'DUPLICATE_USAGE_EVENT',

  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
