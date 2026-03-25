import { ApiProperty } from '@nestjs/swagger';

import { Organization } from '../entities/organization.entity';

export class OrganizationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  static from(org: Organization): OrganizationResponseDto {
    const dto = new OrganizationResponseDto();
    dto.id = org.id;
    dto.name = org.name;
    dto.slug = org.slug;
    dto.isActive = org.isActive;
    dto.createdAt = org.createdAt;
    return dto;
  }
}
