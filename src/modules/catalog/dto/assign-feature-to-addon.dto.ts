import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

import { OveragePolicy } from '../enums/overage-policy.enum';

export class AssignFeatureToAddonDto {
  @IsUUID()
  featureId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  includedLimit?: number;

  @IsOptional()
  @IsEnum(OveragePolicy)
  overagePolicy?: OveragePolicy;
}
