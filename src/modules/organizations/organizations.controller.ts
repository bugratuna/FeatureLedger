
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { PaginationDto, PaginatedResult } from '@common/dto/pagination.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { OrganizationMemberGuard } from '@common/guards/organization-member.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { AuthenticatedUser } from '@common/types/request.types';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';
import { OrganizationsService } from './organizations.service';
import { AcceptInvitationDto } from '../memberships/dto/accept-invitation.dto';
import { InvitationResponseDto } from '../memberships/dto/invitation-response.dto';
import { InviteMemberDto } from '../memberships/dto/invite-member.dto';
import { MembershipResponseDto } from '../memberships/dto/membership-response.dto';
import { MembershipRole } from '../memberships/enums/membership-role.enum';
import { MembershipsService } from '../memberships/memberships.service';

@ApiTags('Organizations')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly membershipsService: MembershipsService,
  ) {}

  /**
   * Creates an organization and immediately makes the caller the owner.
   * Any authenticated user can create an org.
   */
  @Post('organizations')
  @ApiOperation({ summary: 'Create an organization' })
  async create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrganizationResponseDto> {
    const org = await this.organizationsService.create(dto);
    await this.membershipsService.createMembership({
      organizationId: org.id,
      userId: user.id,
      role: MembershipRole.Owner,
    });
    return OrganizationResponseDto.from(org);
  }

  @Get('organizations/:orgId')
  @UseGuards(OrganizationMemberGuard)
  @ApiOperation({ summary: 'Get organization details' })
  async getOrganization(
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ): Promise<OrganizationResponseDto> {
    const org = await this.organizationsService.findByIdOrThrow(orgId);
    return OrganizationResponseDto.from(org);
  }

  @Get('organizations/:orgId/members')
  @UseGuards(OrganizationMemberGuard)
  @ApiOperation({ summary: 'List organization members' })
  async listMembers(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResult<MembershipResponseDto>> {
    const result = await this.membershipsService.getOrganizationMembers(orgId, pagination);
    return { ...result, items: result.items.map(MembershipResponseDto.from) };
  }

  /**
   * Creates an invitation. Admin or owner required.
   * In production, the returned token would be sent via email, not in the response body.
   * For this portfolio project it is returned directly for reviewability.
   */
  @Post('organizations/:orgId/invitations')
  @UseGuards(OrganizationMemberGuard, RolesGuard)
  @Roles(MembershipRole.Admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite a user to the organization' })
  async inviteMember(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InvitationResponseDto> {
    const { invitation, rawToken } = await this.membershipsService.createInvitation({
      organizationId: orgId,
      email: dto.email,
      role: dto.role,
      invitedByUserId: user.id,
    });
    return InvitationResponseDto.from(invitation, rawToken);
  }

  /**
   * Accepts an invitation by token. The authenticated user's email must match
   * the email the invitation was addressed to.
   */
  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an organization invitation' })
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MembershipResponseDto> {
    const membership = await this.membershipsService.acceptInvitation(
      dto.token,
      user.id,
      user.email,
    );
    return MembershipResponseDto.from(membership);
  }
}
