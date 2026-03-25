import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';

import { MembershipRole } from '../enums/membership-role.enum';

export class InviteMemberDto {
  @ApiProperty({ example: 'colleague@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ enum: MembershipRole, example: MembershipRole.Analyst })
  @IsEnum(MembershipRole)
  role!: MembershipRole;
}
