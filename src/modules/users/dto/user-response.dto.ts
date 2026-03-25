import { ApiProperty } from '@nestjs/swagger';

import { User } from '../entities/user.entity';

/**
 * Safe public representation of a user.
 * Never includes passwordHash or internal flags unless explicitly intended.
 */
export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  isPlatformAdmin!: boolean;

  @ApiProperty()
  createdAt!: Date;

  static from(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.displayName = user.displayName;
    dto.isPlatformAdmin = user.isPlatformAdmin;
    dto.createdAt = user.createdAt;
    return dto;
  }
}
