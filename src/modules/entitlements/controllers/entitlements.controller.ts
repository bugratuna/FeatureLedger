import { Roles } from '@common/decorators/roles.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { OrganizationMemberGuard } from '@common/guards/organization-member.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Get,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { MembershipRole } from '../../memberships/enums/membership-role.enum';
import { EntitlementResponseDto, RecalculateResponseDto } from '../dto/entitlement-response.dto';
import { EntitlementSnapshotService } from '../services/entitlement-snapshot.service';

@ApiTags('Entitlements')
@ApiBearerAuth('access-token')
@Controller('organizations/:orgId/entitlements')
@UseGuards(JwtAuthGuard, OrganizationMemberGuard)
export class EntitlementsController {
  constructor(private readonly snapshotService: EntitlementSnapshotService) {}

  /**
   * Return the current precomputed entitlement snapshot for the organization.
   * Any org member can read. Call recalculate first if you need fresh data.
   */
  @Get()
  @ApiOperation({ summary: 'Get the current entitlement snapshot for the organization' })
  async getEntitlements(
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ): Promise<EntitlementResponseDto[]> {
    const rows = await this.snapshotService.findSnapshot(orgId);
    return rows.map(EntitlementResponseDto.from);
  }

  /**
   * Recalculate and replace the entitlement snapshot from the current subscription,
   * addons, and active overrides. Requires Billing role or higher.
   *
   * This is an explicit, reviewer-friendly recalculation rather than a hidden
   * side-effect trigger. Call this after any subscription or override change.
   */
  @Post('recalculate')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.Billing)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recalculate entitlement snapshot from current subscription and overrides' })
  async recalculate(
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ): Promise<RecalculateResponseDto> {
    const rows = await this.snapshotService.recalculate(orgId);
    const recalculatedAt = rows[0]?.recalculatedAt ?? new Date();

    const response = new RecalculateResponseDto();
    response.snapshotCount = rows.length;
    response.recalculatedAt = recalculatedAt;
    response.entitlements = rows.map(EntitlementResponseDto.from);
    return response;
  }
}
