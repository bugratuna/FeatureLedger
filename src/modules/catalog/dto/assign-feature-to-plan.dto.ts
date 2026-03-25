import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

import { OveragePolicy } from '../enums/overage-policy.enum';

export class AssignFeatureToPlanDto {
  @IsUUID()
  featureId!: string;

  /**
   * Units included before overage. Omit or set null for unlimited.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  includedLimit?: number;

  @IsOptional()
  @IsEnum(OveragePolicy)
  overagePolicy?: OveragePolicy;
}
