import { ErrorCode } from '@common/constants/error-codes';
import { PaginatedResult, PaginationDto, paginate } from '@common/dto/pagination.dto';
import { AppException, NotFoundException } from '@common/exceptions/app.exception';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Feature } from '../../catalog/entities/feature.entity';
import { CreateOverrideDto } from '../dto/create-override.dto';
import { UpdateOverrideDto } from '../dto/update-override.dto';
import { OrganizationFeatureOverride } from '../entities/organization-feature-override.entity';

/**
 * Manages OrganizationFeatureOverride rows.
 *
 * Business rules:
 * - One override row per (organizationId, featureId). The DB unique constraint
 *   enforces this at storage level; the service gives a clearer error message.
 * - startsAt and endsAt must form a valid range if both are provided.
 * - endsAt must be in the future when provided on create.
 * - The feature must exist in the catalog.
 */
@Injectable()
export class OverridesService {
  constructor(
    @InjectRepository(OrganizationFeatureOverride)
    private readonly overrideRepo: Repository<OrganizationFeatureOverride>,
    @InjectRepository(Feature)
    private readonly featureRepo: Repository<Feature>,
  ) {}

  async create(organizationId: string, dto: CreateOverrideDto): Promise<OrganizationFeatureOverride> {
    // Validate the feature exists
    const feature = await this.featureRepo.findOne({ where: { id: dto.featureId } });
    if (!feature) throw new NotFoundException('Feature', dto.featureId);

    // Validate date range
    this.assertValidDateRange(dto.startsAt, dto.endsAt);

    // Check for existing override — surface a clear error before hitting the DB constraint
    const existing = await this.overrideRepo.findOne({
      where: { organizationId, featureId: dto.featureId },
    });
    if (existing) {
      throw new AppException(
        ErrorCode.OVERRIDE_CONFLICT,
        `An override for feature '${feature.code}' already exists for this organization. Use PATCH to update it.`,
        HttpStatus.CONFLICT,
        { overrideId: existing.id },
      );
    }

    const override = this.overrideRepo.create({
      organizationId,
      featureId: dto.featureId,
      isEnabled: dto.isEnabled,
      limitOverride: dto.limitOverride ?? null,
      overrideReason: dto.overrideReason ?? null,
      startsAt: dto.startsAt ?? null,
      endsAt: dto.endsAt ?? null,
    });

    const saved = await this.overrideRepo.save(override);
    // Load feature relation for the response DTO
    saved.feature = feature;
    return saved;
  }

  async findAll(
    organizationId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<OrganizationFeatureOverride>> {
    const [items, total] = await this.overrideRepo.findAndCount({
      where: { organizationId },
      relations: ['feature'],
      order: { createdAt: 'DESC' },
      skip: pagination.offset,
      take: pagination.limit,
    });

    return paginate(items, total, pagination);
  }

  async findByIdOrThrow(organizationId: string, overrideId: string): Promise<OrganizationFeatureOverride> {
    const override = await this.overrideRepo.findOne({
      where: { id: overrideId, organizationId },
      relations: ['feature'],
    });
    if (!override) {
      throw new AppException(
        ErrorCode.OVERRIDE_NOT_FOUND,
        `Override '${overrideId}' not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    return override;
  }

  async update(
    organizationId: string,
    overrideId: string,
    dto: UpdateOverrideDto,
  ): Promise<OrganizationFeatureOverride> {
    const override = await this.findByIdOrThrow(organizationId, overrideId);

    const newStartsAt = dto.startsAt !== undefined ? dto.startsAt : override.startsAt;
    const newEndsAt = dto.endsAt !== undefined ? dto.endsAt : override.endsAt;
    this.assertValidDateRange(newStartsAt ?? undefined, newEndsAt ?? undefined);

    if (dto.isEnabled !== undefined) override.isEnabled = dto.isEnabled;
    if (dto.limitOverride !== undefined) override.limitOverride = dto.limitOverride;
    if (dto.overrideReason !== undefined) override.overrideReason = dto.overrideReason;
    if (dto.startsAt !== undefined) override.startsAt = dto.startsAt;
    if (dto.endsAt !== undefined) override.endsAt = dto.endsAt;

    return this.overrideRepo.save(override);
  }

  async delete(organizationId: string, overrideId: string): Promise<void> {
    const override = await this.findByIdOrThrow(organizationId, overrideId);
    await this.overrideRepo.remove(override);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private assertValidDateRange(startsAt?: Date | null, endsAt?: Date | null): void {
    if (endsAt && endsAt <= new Date()) {
      throw new AppException(
        ErrorCode.OVERRIDE_DATE_RANGE_INVALID,
        'endsAt must be in the future',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (startsAt && endsAt && startsAt >= endsAt) {
      throw new AppException(
        ErrorCode.OVERRIDE_DATE_RANGE_INVALID,
        'startsAt must be before endsAt',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
