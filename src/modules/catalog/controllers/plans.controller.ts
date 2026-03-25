
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '@common/guards/platform-admin.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CatalogService } from '../catalog.service';
import { AssignFeatureToPlanDto } from '../dto/assign-feature-to-plan.dto';
import { CreatePlanDto } from '../dto/create-plan.dto';
import { UpdatePlanDto } from '../dto/update-plan.dto';

@Controller('catalog/plans')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlansController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.catalogService.createPlan(dto);
  }

  @Get()
  findAll() {
    return this.catalogService.findAllPlans();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.findPlanByIdOrThrow(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    return this.catalogService.updatePlan(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.catalogService.deletePlan(id);
  }

  // ─── Plan Feature mappings ─────────────────────────────────────────────

  @Post(':id/features')
  assignFeature(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignFeatureToPlanDto) {
    return this.catalogService.assignFeatureToPlan(id, dto);
  }

  @Get(':id/features')
  getFeatures(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.findPlanFeatures(id);
  }

  @Delete(':id/features/:featureId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFeature(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('featureId', ParseUUIDPipe) featureId: string,
  ) {
    await this.catalogService.removePlanFeature(id, featureId);
  }
}
