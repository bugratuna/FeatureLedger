import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { OrganizationFeatureOverride } from '../entities/organization-feature-override.entity';

export class OverrideResponseDto {
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

  @ApiProperty()
  isEnabled!: boolean;

  @ApiPropertyOptional({ nullable: true })
  limitOverride!: number | null;

  @ApiPropertyOptional({ nullable: true })
  overrideReason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  startsAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  endsAt!: Date | null;

  /** Whether this override is currently active (within its time window). */
  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static from(override: OrganizationFeatureOverride): OverrideResponseDto {
    const dto = new OverrideResponseDto();
    dto.id = override.id;
    dto.organizationId = override.organizationId;
    dto.featureId = override.featureId;
    dto.featureCode = override.feature.code;
    dto.featureName = override.feature.name;
    dto.isEnabled = override.isEnabled;
    dto.limitOverride = override.limitOverride;
    dto.overrideReason = override.overrideReason;
    dto.startsAt = override.startsAt;
    dto.endsAt = override.endsAt;
    dto.isActive = isOverrideActive(override);
    dto.createdAt = override.createdAt;
    dto.updatedAt = override.updatedAt;
    return dto;
  }
}

/** Returns true if the override is within its time window right now. */
export function isOverrideActive(override: OrganizationFeatureOverride): boolean {
  const now = new Date();
  if (override.startsAt && override.startsAt > now) return false;
  if (override.endsAt && override.endsAt <= now) return false;
  return true;
}
