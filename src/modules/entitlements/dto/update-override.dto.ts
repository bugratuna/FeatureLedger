import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** All fields optional — only provided fields are updated. */
export class UpdateOverrideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  /** Pass null explicitly to clear the limit override. */
  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  limitOverride?: number | null;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startsAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endsAt?: Date | null;
}
