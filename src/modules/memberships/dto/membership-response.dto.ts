import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Membership } from '../entities/membership.entity';
import { MembershipRole } from '../enums/membership-role.enum';

export class MembershipResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: MembershipRole })
  role!: MembershipRole;

  @ApiPropertyOptional()
  invitedByUserId!: string | null;

  @ApiProperty()
  joinedAt!: Date;

  // Flattened from the user relation for list views
  @ApiPropertyOptional()
  userEmail?: string;

  @ApiPropertyOptional()
  userDisplayName?: string;

  static from(membership: Membership): MembershipResponseDto {
    const dto = new MembershipResponseDto();
    dto.id = membership.id;
    dto.organizationId = membership.organizationId;
    dto.userId = membership.userId;
    dto.role = membership.role;
    dto.invitedByUserId = membership.invitedByUserId;
    dto.joinedAt = membership.joinedAt;

    if (membership.user) {
      dto.userEmail = membership.user.email;
      dto.userDisplayName = membership.user.displayName;
    }

    return dto;
  }
}
