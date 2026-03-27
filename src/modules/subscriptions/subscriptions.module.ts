import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { SubscriptionAddon } from './entities/subscription-addon.entity';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, SubscriptionAddon]),
    AuthModule,         // for JwtAuthGuard + JwtService
    MembershipsModule,  // for OrganizationMemberGuard, RolesGuard
    CatalogModule,      // for Plan and Addon repositories
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
