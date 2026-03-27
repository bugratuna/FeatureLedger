import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SubscriptionAddon } from '../entities/subscription-addon.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionStatus } from '../enums/subscription-status.enum';

class SubscriptionAddonResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  addonId!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  createdAt!: Date;

  static from(sa: SubscriptionAddon): SubscriptionAddonResponseDto {
    const dto = new SubscriptionAddonResponseDto();
    dto.id = sa.id;
    dto.addonId = sa.addonId;
    dto.quantity = sa.quantity;
    dto.createdAt = sa.createdAt;
    return dto;
  }
}

export class SubscriptionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  planId!: string;

  @ApiProperty({ enum: SubscriptionStatus })
  status!: SubscriptionStatus;

  @ApiProperty()
  billingPeriodStart!: Date;

  @ApiProperty()
  billingPeriodEnd!: Date;

  @ApiProperty()
  cancelAtPeriodEnd!: boolean;

  @ApiPropertyOptional()
  canceledAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: [SubscriptionAddonResponseDto] })
  addons!: SubscriptionAddonResponseDto[];

  static from(sub: Subscription): SubscriptionResponseDto {
    const dto = new SubscriptionResponseDto();
    dto.id = sub.id;
    dto.organizationId = sub.organizationId;
    dto.planId = sub.planId;
    dto.status = sub.status;
    dto.billingPeriodStart = sub.billingPeriodStart;
    dto.billingPeriodEnd = sub.billingPeriodEnd;
    dto.cancelAtPeriodEnd = sub.cancelAtPeriodEnd;
    dto.canceledAt = sub.canceledAt;
    dto.createdAt = sub.createdAt;
    dto.updatedAt = sub.updatedAt;
    dto.addons = (sub.addons ?? []).map(SubscriptionAddonResponseDto.from);
    return dto;
  }
}
