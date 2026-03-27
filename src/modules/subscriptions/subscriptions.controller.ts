import { Roles } from '@common/decorators/roles.decorator';
import { PaginatedResult, PaginationDto } from '@common/dto/pagination.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { OrganizationMemberGuard } from '@common/guards/organization-member.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AddAddonDto } from './dto/add-addon.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';
import { MembershipRole } from '../memberships/enums/membership-role.enum';

@ApiTags('Subscriptions')
@ApiBearerAuth('access-token')
@Controller('organizations/:orgId/subscriptions')
@UseGuards(JwtAuthGuard, OrganizationMemberGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

/**
 * Create a new subscription for the organization.
 * The plan must be active.
 * The organization must not have an active or trial subscription.
 * Billing role or higher is required.
 */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.Billing)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a subscription for the organization' })
  async create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    const sub = await this.subscriptionsService.create(orgId, dto);
    return SubscriptionResponseDto.from(sub);
  }

  /**
   * Get the current active or trial subscription.
   * Any organization member can read this.
   * Returns 404 if there is no active subscription.
   */
  @Get('current')
  @ApiOperation({ summary: 'Get the current active subscription' })
  async getCurrent(
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ): Promise<SubscriptionResponseDto> {
    const sub = await this.subscriptionsService.findCurrent(orgId);
    return SubscriptionResponseDto.from(sub);
  }

  /**
   * Update the current active or trialing subscription.
   * Use this to change the plan, update billing period, or cancel at period end.
   * Billing role or higher required.
   */
  @Patch('current')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.Billing)
  @ApiOperation({ summary: 'Update the current subscription' })
  async updateCurrent(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: UpdateSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    const sub = await this.subscriptionsService.updateCurrent(orgId, dto);
    return SubscriptionResponseDto.from(sub);
  }

  /**
   * List all subscriptions for the org, newest first.
   * Includes canceled and past_due subscriptions for audit purposes.
   * Any org member can read.
   */
  @Get('history')
  @ApiOperation({ summary: 'List all subscriptions (history)' })
  async getHistory(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResult<SubscriptionResponseDto>> {
    const result = await this.subscriptionsService.findHistory(orgId, pagination);
    return { ...result, items: result.items.map(SubscriptionResponseDto.from) };
  }

  /**
   * Add an addon to the current subscription.
   * The addon must exist and must not already be on the subscription.
   * Billing role or higher required.
   */
  @Post('current/addons')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.Billing)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an addon to the current subscription' })
  async addAddon(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: AddAddonDto,
  ) {
    return this.subscriptionsService.addAddon(orgId, dto);
  }

  /**
   * Remove an addon from the current subscription.
   * Billing role or higher required.
   */
  @Delete('current/addons/:addonId')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.Billing)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an addon from the current subscription' })
  async removeAddon(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('addonId', ParseUUIDPipe) addonId: string,
  ): Promise<void> {
    await this.subscriptionsService.removeAddon(orgId, addonId);
  }
}
