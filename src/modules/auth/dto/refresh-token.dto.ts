import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'The refresh token from a previous login or refresh response' })
  @IsString()
  @IsNotEmpty()
  @Length(64, 64)
  refreshToken!: string;
}
