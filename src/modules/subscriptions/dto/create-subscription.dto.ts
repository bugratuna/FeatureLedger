import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';

import { SubscriptionStatus } from '../enums/subscription-status.enum';

class AddonAssignmentDto {
  @IsUUID()
  addonId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class CreateSubscriptionDto {
  @IsUUID()
  planId!: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsDate()
  @Type(() => Date)
  billingPeriodStart!: Date;

  @IsDate()
  @Type(() => Date)
  billingPeriodEnd!: Date;

  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AddonAssignmentDto)
  addons?: AddonAssignmentDto[];
}
