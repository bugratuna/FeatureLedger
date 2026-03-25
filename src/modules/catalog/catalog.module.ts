import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CatalogService } from './catalog.service';
import { AddonsController } from './controllers/addons.controller';
import { FeaturesController } from './controllers/features.controller';
import { PlansController } from './controllers/plans.controller';
import { AddonFeature } from './entities/addon-feature.entity';
import { Addon } from './entities/addon.entity';
import { Feature } from './entities/feature.entity';
import { PlanFeature } from './entities/plan-feature.entity';
import { Plan } from './entities/plan.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Feature, Plan, PlanFeature, Addon, AddonFeature])],
  controllers: [FeaturesController, PlansController, AddonsController],
  providers: [CatalogService],
  exports: [CatalogService, TypeOrmModule],
})
export class CatalogModule {}
