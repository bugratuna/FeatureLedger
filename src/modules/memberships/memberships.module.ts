import { OrganizationMemberGuard } from '@common/guards/organization-member.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';


import { Invitation } from './entities/invitation.entity';
import { Membership } from './entities/membership.entity';
import { MembershipsService } from './memberships.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Memberships module owns the membership, invitation entities and service.
 * Also provides and exports the OrganizationMemberGuard and RolesGuard so other
 * modules can use them without re-importing TypeORM repositories.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Membership, Invitation]),
    AuthModule, // for TokenService
  ],
  providers: [MembershipsService, OrganizationMemberGuard, RolesGuard],
  exports: [MembershipsService, OrganizationMemberGuard, RolesGuard],
})
export class MembershipsModule {}
