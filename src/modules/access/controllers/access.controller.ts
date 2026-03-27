import { Roles } from '@common/decorators/roles.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { OrganizationMemberGuard } from '@common/guards/organization-member.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { MembershipRole } from '../../memberships/enums/membership-role.enum';
import { AccessCheckResponseDto } from '../dto/access-check-response.dto';
import { AccessCheckDto } from '../dto/access-check.dto';
import { AccessSimulateResponseDto } from '../dto/access-simulate-response.dto';
import { AccessSimulateDto } from '../dto/access-simulate.dto';
import { AccessDecisionService } from '../services/access-decision.service';

@ApiTags('Access')
@ApiBearerAuth('access-token')
@Controller('organizations/:orgId/access')
@UseGuards(JwtAuthGuard, OrganizationMemberGuard)
export class AccessController {
  constructor(private readonly accessDecisionService: AccessDecisionService) {}

  /**
   * Check whether the organization has access to a feature and optional quantity.
   *
   * Reads from the precomputed entitlement snapshot — O(1) table lookup.
   * Call POST /entitlements/recalculate first to ensure the snapshot is current.
   * Any org member can check access (typically called from product code on behalf of the org).
   */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if the org has access to a feature (reads from snapshot)' })
  async check(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: AccessCheckDto,
  ): Promise<AccessCheckResponseDto> {
    return this.accessDecisionService.check(orgId, dto);
  }

  /**
   * Simulate entitlements under a hypothetical plan/addon/override configuration.
   *
   * No changes are persisted. Returns the merged entitlement set for review.
   * Useful for: previewing a plan upgrade, evaluating an addon before purchasing,
   * or checking what overrides would grant.
   *
   * Billing role or higher required (this endpoint exposes plan/pricing detail).
   */
  @Post('simulate')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.Billing)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simulate entitlements under hypothetical plan/addon/override configuration' })
  async simulate(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: AccessSimulateDto,
  ): Promise<AccessSimulateResponseDto> {
    return this.accessDecisionService.simulate(orgId, dto);
  }
}
