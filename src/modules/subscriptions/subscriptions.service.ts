import { ErrorCode } from '@common/constants/error-codes';
import { PaginatedResult, PaginationDto, paginate } from '@common/dto/pagination.dto';
import { AppException, NotFoundException } from '@common/exceptions/app.exception';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { AddAddonDto } from './dto/add-addon.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionAddon } from './entities/subscription-addon.entity';
import { Subscription } from './entities/subscription.entity';
import { ACTIVE_STATUSES, SubscriptionStatus } from './enums/subscription-status.enum';
import { Addon } from '../catalog/entities/addon.entity';
import { Plan } from '../catalog/entities/plan.entity';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionAddon)
    private readonly subscriptionAddonRepo: Repository<SubscriptionAddon>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(Addon)
    private readonly addonRepo: Repository<Addon>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(organizationId: string, dto: CreateSubscriptionDto): Promise<Subscription> {
    // Validate plan
    const plan = await this.planRepo.findOne({ where: { id: dto.planId } });
    if (!plan) {
      throw new NotFoundException('Plan', dto.planId);
    }
    if (!plan.isActive) {
      throw new AppException(
        ErrorCode.SUBSCRIPTION_PLAN_INACTIVE,
        `Plan '${plan.name}' is not active and cannot be subscribed to`,
        HttpStatus.CONFLICT,
      );
    }

    // Check for existing active/trialing subscription
    const existing = await this.subscriptionRepo.findOne({
      where: { organizationId, status: In(ACTIVE_STATUSES) },
    });
    if (existing) {
      throw new AppException(
        ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE,
        'This organization already has an active or trialing subscription',
        HttpStatus.CONFLICT,
        { existingSubscriptionId: existing.id },
      );
    }

    // Validate addons upfront, before opening the transaction
    const addonDtos = dto.addons ?? [];
    if (addonDtos.length > 0) {
      await this.validateAddons(addonDtos.map((a) => a.addonId));
      this.assertNoAddonDuplicates(addonDtos.map((a) => a.addonId));
    }

    // Write subscription + addons in a single transaction
    return this.dataSource.transaction(async (manager) => {
      const subscription = manager.create(Subscription, {
        organizationId,
        planId: dto.planId,
        status: dto.status ?? SubscriptionStatus.Active,
        billingPeriodStart: dto.billingPeriodStart,
        billingPeriodEnd: dto.billingPeriodEnd,
        cancelAtPeriodEnd: dto.cancelAtPeriodEnd ?? false,
        canceledAt: null,
      });

      const saved = await manager.save(Subscription, subscription);

      if (addonDtos.length > 0) {
        const addonEntities = addonDtos.map((a) =>
          manager.create(SubscriptionAddon, {
            subscriptionId: saved.id,
            addonId: a.addonId,
            quantity: a.quantity ?? 1,
          }),
        );
        await manager.save(SubscriptionAddon, addonEntities);
        saved.addons = addonEntities;
      } else {
        saved.addons = [];
      }

      return saved;
    });
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findCurrent(organizationId: string): Promise<Subscription> {
    const sub = await this.subscriptionRepo.findOne({
      where: { organizationId, status: In(ACTIVE_STATUSES) },
      relations: ['addons'],
      order: { createdAt: 'DESC' },
    });

    if (!sub) {
      throw new AppException(
        ErrorCode.SUBSCRIPTION_NOT_FOUND,
        'No active subscription found for this organization',
        HttpStatus.NOT_FOUND,
      );
    }

    return sub;
  }

  async findHistory(
    organizationId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<Subscription>> {
    const [items, total] = await this.subscriptionRepo.findAndCount({
      where: { organizationId },
      relations: ['addons'],
      order: { createdAt: 'DESC' },
      skip: pagination.offset,
      take: pagination.limit,
    });

    return paginate(items, total, pagination);
  }

  async findByIdOrThrow(organizationId: string, subscriptionId: string): Promise<Subscription> {
    const sub = await this.subscriptionRepo.findOne({
      where: { id: subscriptionId, organizationId },
      relations: ['addons'],
    });
    if (!sub) throw new NotFoundException('Subscription', subscriptionId);
    return sub;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateCurrent(organizationId: string, dto: UpdateSubscriptionDto): Promise<Subscription> {
    const sub = await this.findCurrent(organizationId);

    if (dto.planId !== undefined && dto.planId !== sub.planId) {
      const plan = await this.planRepo.findOne({ where: { id: dto.planId } });
      if (!plan) throw new NotFoundException('Plan', dto.planId);
      if (!plan.isActive) {
        throw new AppException(
          ErrorCode.SUBSCRIPTION_PLAN_INACTIVE,
          `Plan '${plan.name}' is not active`,
          HttpStatus.CONFLICT,
        );
      }
      sub.planId = dto.planId;
    }

    if (dto.status !== undefined) sub.status = dto.status;
    if (dto.billingPeriodStart !== undefined) sub.billingPeriodStart = dto.billingPeriodStart;
    if (dto.billingPeriodEnd !== undefined) sub.billingPeriodEnd = dto.billingPeriodEnd;
    if (dto.cancelAtPeriodEnd !== undefined) sub.cancelAtPeriodEnd = dto.cancelAtPeriodEnd;

    if (dto.status === SubscriptionStatus.Canceled && !sub.canceledAt) {
      sub.canceledAt = new Date();
    }

    // save() with version column will throw OptimisticLockVersionMismatchError
    // if the row was concurrently modified
    return this.subscriptionRepo.save(sub);
  }

  // ─── Addons ───────────────────────────────────────────────────────────────

  async addAddon(organizationId: string, dto: AddAddonDto): Promise<SubscriptionAddon> {
    const sub = await this.findCurrent(organizationId);

    const addon = await this.addonRepo.findOne({ where: { id: dto.addonId } });
    if (!addon) throw new NotFoundException('Addon', dto.addonId);

    const existing = await this.subscriptionAddonRepo.findOne({
      where: { subscriptionId: sub.id, addonId: dto.addonId },
    });
    if (existing) {
      throw new AppException(
        ErrorCode.SUBSCRIPTION_ADDON_DUPLICATE,
        `Addon '${addon.name}' is already on this subscription`,
        HttpStatus.CONFLICT,
        { subscriptionId: sub.id, addonId: dto.addonId },
      );
    }

    const sa = this.subscriptionAddonRepo.create({
      subscriptionId: sub.id,
      addonId: dto.addonId,
      quantity: dto.quantity ?? 1,
    });

    return this.subscriptionAddonRepo.save(sa);
  }

  async removeAddon(organizationId: string, addonId: string): Promise<void> {
    const sub = await this.findCurrent(organizationId);

    const sa = await this.subscriptionAddonRepo.findOne({
      where: { subscriptionId: sub.id, addonId },
    });
    if (!sa) {
      throw new AppException(
        ErrorCode.SUBSCRIPTION_ADDON_NOT_FOUND,
        'This addon is not on the current subscription',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.subscriptionAddonRepo.remove(sa);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Verify all addon IDs exist. Throws NotFoundException on first missing addon. */
  private async validateAddons(addonIds: string[]): Promise<void> {
    const found = await this.addonRepo.find({ where: { id: In(addonIds) } });
    const foundIds = new Set(found.map((a) => a.id));
    for (const id of addonIds) {
      if (!foundIds.has(id)) throw new NotFoundException('Addon', id);
    }
  }

  /** Throw if the same addon ID appears more than once in a create payload. */
  private assertNoAddonDuplicates(addonIds: string[]): void {
    const seen = new Set<string>();
    for (const id of addonIds) {
      if (seen.has(id)) {
        throw new AppException(
          ErrorCode.SUBSCRIPTION_ADDON_DUPLICATE,
          `Addon '${id}' appears more than once in the request`,
          HttpStatus.BAD_REQUEST,
        );
      }
      seen.add(id);
    }
  }
}
