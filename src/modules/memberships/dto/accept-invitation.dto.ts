import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty({ description: 'The invitation token received via email' })
  @IsString()
  @IsNotEmpty()
  @Length(64, 64)
  token!: string;
}
