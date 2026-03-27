import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class SimulatedAddonDto {
  @ApiProperty()
  @IsUUID()
  addonId!: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

class SimulatedOverrideDto {
  @ApiProperty()
  @IsUUID()
  featureId!: string;

  @ApiProperty()
  @IsBoolean()
  isEnabled!: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  limitOverride?: number;
}

/**
 * Hypothetical subscription/override configuration to simulate entitlements against.
 * None of these inputs are persisted.
 *
 * Simulate "what would the entitlements look like if the org switches to plan X
 * and adds addon Y with quantity Z?"
 */
export class AccessSimulateDto {
  /** Simulate with this plan. Omit to use the org's current plan. */
  @ApiPropertyOptional({ description: 'Hypothetical plan ID. Omit to use current plan.' })
  @IsOptional()
  @IsUUID()
  planId?: string;

  /** Hypothetical set of addons. Replaces (not appends to) current addons when provided. */
  @ApiPropertyOptional({ type: [SimulatedAddonDto], description: 'Hypothetical addon set. Omit to use current addons.' })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SimulatedAddonDto)
  @ArrayUnique((a: SimulatedAddonDto) => a.addonId, { message: 'Duplicate addonId in simulation input' })
  addons?: SimulatedAddonDto[];

  /** Hypothetical overrides. Replaces (not appends to) current overrides when provided. */
  @ApiPropertyOptional({ type: [SimulatedOverrideDto], description: 'Hypothetical override set. Omit to use current overrides.' })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SimulatedOverrideDto)
  @ArrayUnique((o: SimulatedOverrideDto) => o.featureId, { message: 'Duplicate featureId in simulation overrides' })
  overrides?: SimulatedOverrideDto[];
}
