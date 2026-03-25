import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ description: 'Display name of the organization', example: 'Acme Corp' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  /**
   * Optional slug override. If omitted, it is derived from name.
   * Must be lowercase kebab-case: letters, numbers, and hyphens only.
   */
  @ApiPropertyOptional({
    description: 'URL-safe identifier. Auto-derived from name if omitted.',
    example: 'acme-corp',
  })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase kebab-case (e.g. "acme-corp")',
  })
  slug?: string;
}
