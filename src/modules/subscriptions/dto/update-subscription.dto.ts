import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsOptional, IsUUID } from 'class-validator';

import { SubscriptionStatus } from '../enums/subscription-status.enum';

export class UpdateSubscriptionDto {
  /** Change the plan on the current subscription. The new plan must be active. */
  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  billingPeriodStart?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  billingPeriodEnd?: Date;

  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;
}
