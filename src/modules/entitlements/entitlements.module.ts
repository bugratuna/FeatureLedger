import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PlanFeature } from '../catalog/entities/plan-feature.entity';
import { MembershipsModule } from '../memberships/memberships.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { EntitlementsController } from './controllers/entitlements.controller';
import { OverridesController } from './controllers/overrides.controller';
import { OrganizationEntitlement } from './entities/organization-entitlement.entity';
import { OrganizationFeatureOverride } from './entities/organization-feature-override.entity';
import { EntitlementResolverService } from './services/entitlement-resolver.service';
import { EntitlementSnapshotService } from './services/entitlement-snapshot.service';
import { OverridesService } from './services/overrides.service';
import { AddonFeature } from '../catalog/entities/addon-feature.entity';
import { Feature } from '../catalog/entities/feature.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationFeatureOverride,
      OrganizationEntitlement,
      PlanFeature,
      AddonFeature,
      Feature,
    ]),
    AuthModule,        // for JwtAuthGuard
    MembershipsModule, // for OrganizationMemberGuard, RolesGuard
    CatalogModule,     // for Plan repository used in simulation lookups
    SubscriptionsModule, // for SubscriptionsService (findCurrent)
  ],
  controllers: [EntitlementsController, OverridesController],
  providers: [EntitlementResolverService, EntitlementSnapshotService, OverridesService],
  exports: [EntitlementResolverService, EntitlementSnapshotService, TypeOrmModule],
})
export class EntitlementsModule {}
