import { ErrorCode } from '@common/constants/error-codes';
import { PaginationDto, PaginatedResult, paginate } from '@common/dto/pagination.dto';
import { AppException, ConflictException, NotFoundException } from '@common/exceptions/app.exception';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';


import { Invitation } from './entities/invitation.entity';
import { Membership } from './entities/membership.entity';
import { MembershipRole } from './enums/membership-role.enum';
import { TokenService } from '../auth/services/token.service';

export interface CreateMembershipParams {
  organizationId: string;
  userId: string;
  role: MembershipRole;
  invitedByUserId?: string;
}

export interface CreateInvitationParams {
  organizationId: string;
  email: string;
  role: MembershipRole;
  invitedByUserId: string;
  expiresInDays?: number;
}

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership)
    private readonly membershipRepo: Repository<Membership>,
    @InjectRepository(Invitation)
    private readonly invitationRepo: Repository<Invitation>,
    private readonly tokenService: TokenService,
  ) {}

  async createMembership(params: CreateMembershipParams): Promise<Membership> {
    const existing = await this.membershipRepo.findOne({
      where: { organizationId: params.organizationId, userId: params.userId },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this organization');
    }

    const membership = this.membershipRepo.create({
      organizationId: params.organizationId,
      userId: params.userId,
      role: params.role,
      invitedByUserId: params.invitedByUserId ?? null,
    });

    return this.membershipRepo.save(membership);
  }

  async findMembership(organizationId: string, userId: string): Promise<Membership | null> {
    return this.membershipRepo.findOne({ where: { organizationId, userId } });
  }

  async getOrganizationMembers(
    organizationId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<Membership>> {
    const [items, total] = await this.membershipRepo.findAndCount({
      where: { organizationId },
      relations: ['user'],
      order: { joinedAt: 'ASC' },
      skip: pagination.offset,
      take: pagination.limit,
    });

    return paginate(items, total, pagination);
  }

  async createInvitation(params: CreateInvitationParams): Promise<{ invitation: Invitation; rawToken: string }> {
    const { raw, hash } = this.tokenService.generateInvitationToken();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (params.expiresInDays ?? 7));

    const invitation = this.invitationRepo.create({
      organizationId: params.organizationId,
      email: params.email.toLowerCase(),
      role: params.role,
      tokenHash: hash,
      invitedByUserId: params.invitedByUserId,
      expiresAt,
    });

    return { invitation: await this.invitationRepo.save(invitation), rawToken: raw };
  }

  async findInvitationByTokenOrThrow(rawToken: string): Promise<Invitation> {
    const hash = this.tokenService.hashToken(rawToken);
    const invitation = await this.invitationRepo.findOne({ where: { tokenHash: hash } });

    if (!invitation) {
      throw new NotFoundException('Invitation');
    }

    return invitation;
  }

  /**
   * Accepts an invitation and creates the membership.
   * Validates: not already accepted, not expired, email matches the authenticated user.
   */
  async acceptInvitation(
    rawToken: string,
    userId: string,
    userEmail: string,
  ): Promise<Membership> {
    const invitation = await this.findInvitationByTokenOrThrow(rawToken);

    if (invitation.acceptedAt) {
      throw new AppException(
        ErrorCode.RESOURCE_CONFLICT,
        'This invitation has already been accepted',
        409,
      );
    }

    if (invitation.expiresAt < new Date()) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'This invitation has expired',
        410,
      );
    }

    if (invitation.email !== userEmail.toLowerCase()) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'This invitation was sent to a different email address',
        403,
      );
    }

    // Mark accepted and create membership in a single operation sequence
    // For production-grade atomicity, wrap in a transaction via QueryRunner
    invitation.acceptedAt = new Date();
    await this.invitationRepo.save(invitation);

    return this.createMembership({
      organizationId: invitation.organizationId,
      userId,
      role: invitation.role,
      invitedByUserId: invitation.invitedByUserId,
    });
  }
}
