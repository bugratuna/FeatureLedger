import { ConflictException, NotFoundException } from '@common/exceptions/app.exception';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateOrganizationDto } from './dto/create-organization.dto';
import { Organization } from './entities/organization.entity';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
  ) {}

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const slug = dto.slug ?? this.deriveSlug(dto.name);

    const existing = await this.orgRepo.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException(`An organization with slug '${slug}' already exists`, { slug });
    }

    const org = this.orgRepo.create({ name: dto.name, slug });
    return this.orgRepo.save(org);
  }

  async findById(id: string): Promise<Organization | null> {
    return this.orgRepo.findOne({ where: { id } });
  }

  async findByIdOrThrow(id: string): Promise<Organization> {
    const org = await this.findById(id);
    if (!org) throw new NotFoundException('Organization', id);
    return org;
  }

  /**
   * Derives a URL-safe slug from an organization name.
   *
   * Strategy:
   *   1. Lowercase
   *   2. Replace non-alphanumeric sequences with hyphens
   *   3. Strip leading/trailing hyphens
   *   4. Truncate to 100 characters
   *
   * "Acme Corp & Partners!" → "acme-corp-partners"
   */
  deriveSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
  }
}
