import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Reason codes for access decisions.
 *
 * These are stable identifiers clients can match on programmatically.
 * New reasons can be added in future phases without removing existing ones.
 */
export type AccessDenialReason =
  | 'feature_not_included' // feature not in subscription or any addon
  | 'feature_disabled' // feature present but explicitly disabled by an override
  | 'quota_exceeded'; // feature is limit-based and requestedQuantity exceeds effectiveLimit

export type AccessGrantReason =
  | 'feature_included' // boolean feature: included in plan/addon/override
  | 'quota_available'; // limit-based feature: requested quantity is within effective limit

export class AccessCheckResponseDto {
  @ApiProperty({ description: 'Whether the requested access is allowed' })
  allowed!: boolean;

  @ApiProperty({
    description:
      'Machine-readable reason for the decision. ' +
      'Stable codes: feature_included, quota_available, feature_not_included, feature_disabled, quota_exceeded',
  })
  reason!: AccessGrantReason | AccessDenialReason;

  @ApiProperty({ description: 'The feature code that was evaluated' })
  featureCode!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Effective limit for limit-based features. null means unlimited.',
  })
  limit!: number | null;

  /**
   * How many units the org has consumed this billing period.
   * null until usage metering (Phase 4) is implemented.
   * Intentionally included in the response shape now so clients can depend on the field.
   */
  @ApiPropertyOptional({ nullable: true, description: 'Units consumed this period (null until usage metering is live)' })
  consumed!: number | null;

  /**
   * Units remaining (limit - consumed). null when limit or consumed is unknown.
   */
  @ApiPropertyOptional({ nullable: true, description: 'Units remaining (null until usage metering is live)' })
  remaining!: number | null;
}
