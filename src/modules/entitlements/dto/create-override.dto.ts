import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateOverrideDto {
  @ApiProperty({ description: 'Feature ID to override' })
  @IsUUID()
  featureId!: string;

  /**
   * true = force-enable this feature for the org regardless of their plan.
   * false = force-disable this feature even if their plan includes it.
   */
  @ApiProperty({ description: 'Force-enable (true) or force-disable (false) the feature' })
  @IsBoolean()
  isEnabled!: boolean;

  /**
   * Replaces the computed effective limit. NULL = do not override the limit.
   * Only meaningful when isEnabled = true.
   */
  @ApiPropertyOptional({ description: 'Custom limit replacing the plan/addon computed limit', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  limitOverride?: number;

  @ApiPropertyOptional({ description: 'Short note explaining why this override was created', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string;

  /** Override becomes active at this time. Omit for immediate effect. */
  @ApiPropertyOptional({ description: 'When the override takes effect (ISO 8601). Omit for immediate.' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startsAt?: Date;

  /** Override expires at this time. Omit for no expiry. */
  @ApiPropertyOptional({ description: 'When the override expires (ISO 8601). Omit for no expiry.' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endsAt?: Date;
}
