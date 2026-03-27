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

import { MembershipRole } from '../../memberships/enums/membership-role.enum';
import { CreateOverrideDto } from '../dto/create-override.dto';
import { OverrideResponseDto } from '../dto/override-response.dto';
import { UpdateOverrideDto } from '../dto/update-override.dto';
import { OverridesService } from '../services/overrides.service';

@ApiTags('Entitlements')
@ApiBearerAuth('access-token')
@Controller('organizations/:orgId/feature-overrides')
@UseGuards(JwtAuthGuard, OrganizationMemberGuard)
export class OverridesController {
  constructor(private readonly overridesService: OverridesService) {}

  /**
   * Create a manual feature override for the organization.
   * Requires Admin role or higher (support/sales-driven grants should be intentional).
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.Admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a feature override for the organization' })
  async create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateOverrideDto,
  ): Promise<OverrideResponseDto> {
    const override = await this.overridesService.create(orgId, dto);
    return OverrideResponseDto.from(override);
  }

  /**
   * List all feature overrides for the organization.
   * Billing role or higher required.
   */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.Billing)
  @ApiOperation({ summary: 'List feature overrides for the organization' })
  async findAll(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResult<OverrideResponseDto>> {
    const result = await this.overridesService.findAll(orgId, pagination);
    return { ...result, items: result.items.map(OverrideResponseDto.from) };
  }

  /**
   * Update an existing feature override.
   * Requires Admin role or higher.
   */
  @Patch(':overrideId')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.Admin)
  @ApiOperation({ summary: 'Update a feature override' })
  async update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('overrideId', ParseUUIDPipe) overrideId: string,
    @Body() dto: UpdateOverrideDto,
  ): Promise<OverrideResponseDto> {
    const override = await this.overridesService.update(orgId, overrideId, dto);
    return OverrideResponseDto.from(override);
  }

  /**
   * Delete a feature override. The next recalculate call will remove it from the snapshot.
   * Requires Admin role or higher.
   */
  @Delete(':overrideId')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a feature override' })
  async delete(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('overrideId', ParseUUIDPipe) overrideId: string,
  ): Promise<void> {
    await this.overridesService.delete(orgId, overrideId);
  }
}
