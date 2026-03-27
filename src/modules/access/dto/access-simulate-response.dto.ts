import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { MeterType } from '../../catalog/enums/meter-type.enum';
import { OveragePolicy } from '../../catalog/enums/overage-policy.enum';
import { EntitlementSourceType } from '../../entitlements/enums/entitlement-source-type.enum';
import { ResolvedEntitlement } from '../../entitlements/services/entitlement-resolver.service';

class SimulatedEntitlementDto {
  @ApiProperty()
  featureCode!: string;

  @ApiProperty()
  featureName!: string;

  @ApiProperty({ enum: MeterType })
  meterType!: MeterType;

  @ApiProperty()
  isEnabled!: boolean;

  @ApiPropertyOptional({ nullable: true })
  effectiveLimit!: number | null;

  @ApiProperty({ enum: OveragePolicy })
  overagePolicy!: OveragePolicy;

  @ApiProperty({ enum: EntitlementSourceType })
  sourceType!: EntitlementSourceType;

  static from(r: ResolvedEntitlement): SimulatedEntitlementDto {
    const dto = new SimulatedEntitlementDto();
    dto.featureCode = r.featureCode;
    dto.featureName = r.featureName;
    dto.meterType = r.meterType;
    dto.isEnabled = r.isEnabled;
    dto.effectiveLimit = r.effectiveLimit;
    dto.overagePolicy = r.overagePolicy;
    dto.sourceType = r.sourceType;
    return dto;
  }
}

export class AccessSimulateResponseDto {
  /** Always true — signals to clients that this is a simulation result, not live state. */
  @ApiProperty({ example: true })
  hypothetical!: true;

  @ApiProperty({ type: [SimulatedEntitlementDto] })
  entitlements!: SimulatedEntitlementDto[];

  static from(resolved: ResolvedEntitlement[]): AccessSimulateResponseDto {
    const dto = new AccessSimulateResponseDto();
    dto.hypothetical = true;
    dto.entitlements = resolved.map(SimulatedEntitlementDto.from);
    return dto;
  }
}
