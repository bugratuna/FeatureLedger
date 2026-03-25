import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';

import { MeterType } from '../enums/meter-type.enum';

export class CreateFeatureDto {
  /**
   * Machine-readable identifier. Will be normalized to lowercase kebab-case by the service.
   * Accepts letters, numbers, hyphens, and underscores.
   */
  @IsString()
  @Length(1, 100)
  @Matches(/^[a-z0-9_-]+$/i, {
    message: 'code must contain only letters, numbers, hyphens, and underscores',
  })
  code!: string;

  @IsString()
  @Length(1, 255)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  unitLabel?: string;

  @IsEnum(MeterType)
  meterType!: MeterType;
}
