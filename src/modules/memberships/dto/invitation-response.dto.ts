import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Invitation } from '../entities/invitation.entity';
import { MembershipRole } from '../enums/membership-role.enum';

export class InvitationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: MembershipRole })
  role!: MembershipRole;

  /**
   * Raw token is included ONLY in the creation response.
   * Subsequent fetches of the invitation record will not include it.
   * In production, this would be sent via email rather than returned in the response body.
   */
  @ApiPropertyOptional({
    description: 'Included only in the creation response. Send to invitee via out-of-band channel.',
  })
  token?: string;

  @ApiProperty()
  expiresAt!: Date;

  @ApiPropertyOptional()
  acceptedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  static from(invitation: Invitation, rawToken?: string): InvitationResponseDto {
    const dto = new InvitationResponseDto();
    dto.id = invitation.id;
    dto.organizationId = invitation.organizationId;
    dto.email = invitation.email;
    dto.role = invitation.role;
    dto.expiresAt = invitation.expiresAt;
    dto.acceptedAt = invitation.acceptedAt;
    dto.createdAt = invitation.createdAt;

    if (rawToken) {
      dto.token = rawToken;
    }

    return dto;
  }
}
