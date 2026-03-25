import { ApiProperty } from '@nestjs/swagger';

import { MembershipRole } from '../../memberships/enums/membership-role.enum';

export class TokenPairDto {
  @ApiProperty({ description: 'Short-lived JWT access token (15m by default)' })
  accessToken!: string;

  @ApiProperty({ description: 'Long-lived refresh token for rotation (30d by default)' })
  refreshToken!: string;
}

export class MembershipSummaryDto {
  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiProperty({ enum: MembershipRole })
  role!: MembershipRole;
}

export class AuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  isPlatformAdmin!: boolean;
}

export class LoginResponseDto extends TokenPairDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

export class MeResponseDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ type: [MembershipSummaryDto] })
  memberships!: MembershipSummaryDto[];
}
