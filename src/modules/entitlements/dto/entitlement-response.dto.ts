import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { MeterType } from '../../catalog/enums/meter-type.enum';
import { OveragePolicy } from '../../catalog/enums/overage-policy.enum';
import { OrganizationEntitlement } from '../entities/organization-entitlement.entity';
import { EntitlementSourceType } from '../enums/entitlement-source-type.enum';

export class EntitlementResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  featureId!: string;

  @ApiProperty()
  featureCode!: string;

  @ApiProperty()
  featureName!: string;

  @ApiProperty({ enum: MeterType })
  meterType!: MeterType;

  @ApiProperty({ enum: EntitlementSourceType })
  sourceType!: EntitlementSourceType;

  @ApiProperty()
  isEnabled!: boolean;

  @ApiPropertyOptional({ nullable: true })
  effectiveLimit!: number | null;

  @ApiProperty({ enum: OveragePolicy })
  overagePolicy!: OveragePolicy;

  @ApiPropertyOptional({ nullable: true })
  billingPeriodStart!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  billingPeriodEnd!: Date | null;

  @ApiProperty()
  recalculatedAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static from(e: OrganizationEntitlement): EntitlementResponseDto {
    const dto = new EntitlementResponseDto();
    dto.id = e.id;
    dto.organizationId = e.organizationId;
    dto.featureId = e.featureId;
    dto.featureCode = e.featureCode;
    dto.featureName = e.featureName;
    dto.meterType = e.meterType;
    dto.sourceType = e.sourceType;
    dto.isEnabled = e.isEnabled;
    dto.effectiveLimit = e.effectiveLimit;
    dto.overagePolicy = e.overagePolicy;
    dto.billingPeriodStart = e.billingPeriodStart;
    dto.billingPeriodEnd = e.billingPeriodEnd;
    dto.recalculatedAt = e.recalculatedAt;
    dto.updatedAt = e.updatedAt;
    return dto;
  }
}

export class RecalculateResponseDto {
  @ApiProperty({ description: 'Number of entitlement snapshot rows written' })
  snapshotCount!: number;

  @ApiProperty({ description: 'When recalculation completed' })
  recalculatedAt!: Date;

  @ApiProperty({ type: [EntitlementResponseDto] })
  entitlements!: EntitlementResponseDto[];
}
