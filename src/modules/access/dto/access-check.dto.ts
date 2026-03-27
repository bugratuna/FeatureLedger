import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AccessCheckDto {
  /**
   * The stable, machine-readable feature code (e.g., "report_exports", "api-calls").
   * Must match a Feature.code in the catalog.
   */
  @ApiProperty({ example: 'report_exports', description: 'Stable feature code to check access for' })
  @IsString()
  featureCode!: string;

  /**
   * How many units the caller is requesting.
   * Defaults to 1. For boolean features, this value is ignored.
   * For limit-based features, access is allowed if requestedQuantity <= effectiveLimit.
   */
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Number of units requested (default 1)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  requestedQuantity?: number;
}
