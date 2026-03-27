import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AccessController } from './controllers/access.controller';
import { AccessDecisionService } from './services/access-decision.service';
import { AddonFeature } from '../catalog/entities/addon-feature.entity';
import { Feature } from '../catalog/entities/feature.entity';
import { PlanFeature } from '../catalog/entities/plan-feature.entity';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Feature, PlanFeature, AddonFeature]),
    EntitlementsModule, // provides EntitlementResolverService + OrganizationEntitlement and OrganizationFeatureOverride repos via TypeOrmModule export
    AuthModule,
    MembershipsModule,
    SubscriptionsModule,
  ],
  controllers: [AccessController],
  providers: [AccessDecisionService],
})
export class AccessModule {}
