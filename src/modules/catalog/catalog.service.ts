import { ConflictException, NotFoundException } from '@common/exceptions/app.exception';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AssignFeatureToAddonDto } from './dto/assign-feature-to-addon.dto';
import { AssignFeatureToPlanDto } from './dto/assign-feature-to-plan.dto';
import { CreateAddonDto } from './dto/create-addon.dto';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdateAddonDto } from './dto/update-addon.dto';
import { UpdateFeatureDto } from './dto/update-feature.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { AddonFeature } from './entities/addon-feature.entity';
import { Addon } from './entities/addon.entity';
import { Feature } from './entities/feature.entity';
import { PlanFeature } from './entities/plan-feature.entity';
import { Plan } from './entities/plan.entity';
import { OveragePolicy } from './enums/overage-policy.enum';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Feature)
    private readonly featureRepo: Repository<Feature>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(PlanFeature)
    private readonly planFeatureRepo: Repository<PlanFeature>,
    @InjectRepository(Addon)
    private readonly addonRepo: Repository<Addon>,
    @InjectRepository(AddonFeature)
    private readonly addonFeatureRepo: Repository<AddonFeature>,
  ) {}

  // ─── Features ─────────────────────────────────────────────────────────────

  async createFeature(dto: CreateFeatureDto): Promise<Feature> {
    const code = this.normalizeCode(dto.code);

    const existing = await this.featureRepo.findOne({ where: { code } });
    if (existing) {
      throw new ConflictException(`A feature with code '${code}' already exists`, { code });
    }

    const feature = this.featureRepo.create({
      code,
      name: dto.name,
      unitLabel: dto.unitLabel ?? null,
      meterType: dto.meterType,
    });
    return this.featureRepo.save(feature);
  }

  async findAllFeatures(): Promise<Feature[]> {
    return this.featureRepo.find({ order: { code: 'ASC' } });
  }

  async findFeatureByIdOrThrow(id: string): Promise<Feature> {
    const feature = await this.featureRepo.findOne({ where: { id } });
    if (!feature) throw new NotFoundException('Feature', id);
    return feature;
  }

  async updateFeature(id: string, dto: UpdateFeatureDto): Promise<Feature> {
    const feature = await this.findFeatureByIdOrThrow(id);

    if (dto.code !== undefined) {
      const code = this.normalizeCode(dto.code);
      if (code !== feature.code) {
        const existing = await this.featureRepo.findOne({ where: { code } });
        if (existing) {
          throw new ConflictException(`A feature with code '${code}' already exists`, { code });
        }
        feature.code = code;
      }
    }

    if (dto.name !== undefined) feature.name = dto.name;
    if (dto.unitLabel !== undefined) feature.unitLabel = dto.unitLabel ?? null;
    if (dto.meterType !== undefined) feature.meterType = dto.meterType;

    return this.featureRepo.save(feature);
  }

  async deleteFeature(id: string): Promise<void> {
    const feature = await this.findFeatureByIdOrThrow(id);
    await this.featureRepo.remove(feature);
  }

  // ─── Plans ────────────────────────────────────────────────────────────────

  async createPlan(dto: CreatePlanDto): Promise<Plan> {
    const slug = this.deriveSlug(dto.name);

    const existing = await this.planRepo.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException(`A plan with slug '${slug}' already exists`, { slug });
    }

    const plan = this.planRepo.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
      isActive: dto.isActive ?? true,
    });
    return this.planRepo.save(plan);
  }

  async findAllPlans(): Promise<Plan[]> {
    return this.planRepo.find({ order: { name: 'ASC' } });
  }

  async findPlanByIdOrThrow(id: string): Promise<Plan> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan', id);
    return plan;
  }

  async updatePlan(id: string, dto: UpdatePlanDto): Promise<Plan> {
    const plan = await this.findPlanByIdOrThrow(id);

    if (dto.name !== undefined) plan.name = dto.name;
    if (dto.description !== undefined) plan.description = dto.description ?? null;
    if (dto.isActive !== undefined) plan.isActive = dto.isActive;

    return this.planRepo.save(plan);
  }

  async deletePlan(id: string): Promise<void> {
    const plan = await this.findPlanByIdOrThrow(id);
    await this.planRepo.remove(plan);
  }

  // ─── Plan Features ────────────────────────────────────────────────────────

  async assignFeatureToPlan(planId: string, dto: AssignFeatureToPlanDto): Promise<PlanFeature> {
    await this.findPlanByIdOrThrow(planId);
    await this.findFeatureByIdOrThrow(dto.featureId);

    const existing = await this.planFeatureRepo.findOne({
      where: { planId, featureId: dto.featureId },
    });
    if (existing) {
      throw new ConflictException(
        `Feature '${dto.featureId}' is already assigned to this plan`,
        { planId, featureId: dto.featureId },
      );
    }

    const mapping = this.planFeatureRepo.create({
      planId,
      featureId: dto.featureId,
      includedLimit: dto.includedLimit ?? null,
      overagePolicy: dto.overagePolicy ?? OveragePolicy.Deny,
    });
    return this.planFeatureRepo.save(mapping);
  }

  async findPlanFeatures(planId: string): Promise<PlanFeature[]> {
    await this.findPlanByIdOrThrow(planId);
    return this.planFeatureRepo.find({
      where: { planId },
      relations: ['feature'],
      order: { createdAt: 'ASC' },
    });
  }

  async removePlanFeature(planId: string, featureId: string): Promise<void> {
    const mapping = await this.planFeatureRepo.findOne({ where: { planId, featureId } });
    if (!mapping) throw new NotFoundException('PlanFeature');
    await this.planFeatureRepo.remove(mapping);
  }

  // ─── Addons ───────────────────────────────────────────────────────────────

  async createAddon(dto: CreateAddonDto): Promise<Addon> {
    const slug = this.deriveSlug(dto.name);

    const existing = await this.addonRepo.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException(`An addon with slug '${slug}' already exists`, { slug });
    }

    const addon = this.addonRepo.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
    });
    return this.addonRepo.save(addon);
  }

  async findAllAddons(): Promise<Addon[]> {
    return this.addonRepo.find({ order: { name: 'ASC' } });
  }

  async findAddonByIdOrThrow(id: string): Promise<Addon> {
    const addon = await this.addonRepo.findOne({ where: { id } });
    if (!addon) throw new NotFoundException('Addon', id);
    return addon;
  }

  async updateAddon(id: string, dto: UpdateAddonDto): Promise<Addon> {
    const addon = await this.findAddonByIdOrThrow(id);

    if (dto.name !== undefined) addon.name = dto.name;
    if (dto.description !== undefined) addon.description = dto.description ?? null;

    return this.addonRepo.save(addon);
  }

  async deleteAddon(id: string): Promise<void> {
    const addon = await this.findAddonByIdOrThrow(id);
    await this.addonRepo.remove(addon);
  }

  // ─── Addon Features ───────────────────────────────────────────────────────

  async assignFeatureToAddon(addonId: string, dto: AssignFeatureToAddonDto): Promise<AddonFeature> {
    await this.findAddonByIdOrThrow(addonId);
    await this.findFeatureByIdOrThrow(dto.featureId);

    const existing = await this.addonFeatureRepo.findOne({
      where: { addonId, featureId: dto.featureId },
    });
    if (existing) {
      throw new ConflictException(
        `Feature '${dto.featureId}' is already assigned to this addon`,
        { addonId, featureId: dto.featureId },
      );
    }

    const mapping = this.addonFeatureRepo.create({
      addonId,
      featureId: dto.featureId,
      includedLimit: dto.includedLimit ?? null,
      overagePolicy: dto.overagePolicy ?? OveragePolicy.Deny,
    });
    return this.addonFeatureRepo.save(mapping);
  }

  async findAddonFeatures(addonId: string): Promise<AddonFeature[]> {
    await this.findAddonByIdOrThrow(addonId);
    return this.addonFeatureRepo.find({
      where: { addonId },
      relations: ['feature'],
      order: { createdAt: 'ASC' },
    });
  }

  async removeAddonFeature(addonId: string, featureId: string): Promise<void> {
    const mapping = await this.addonFeatureRepo.findOne({ where: { addonId, featureId } });
    if (!mapping) throw new NotFoundException('AddonFeature');
    await this.addonFeatureRepo.remove(mapping);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Normalize the code to lowercase. Underscores are kept (common in metric names).
   * "API_Calls" → "api_calls"  |  "Export PDF" → "export-pdf"
   */
  normalizeCode(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
  }

  /**
   * Build a URL-safe slug from a name. "Pro Plan!" → "pro-plan"
   * Used for plans and addons so their URLs stay simple and stable.
   */
  deriveSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
  }
}
