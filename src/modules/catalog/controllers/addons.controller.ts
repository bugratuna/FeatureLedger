
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
import { AssignFeatureToAddonDto } from '../dto/assign-feature-to-addon.dto';
import { CreateAddonDto } from '../dto/create-addon.dto';
import { UpdateAddonDto } from '../dto/update-addon.dto';

@Controller('catalog/addons')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AddonsController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  create(@Body() dto: CreateAddonDto) {
    return this.catalogService.createAddon(dto);
  }

  @Get()
  findAll() {
    return this.catalogService.findAllAddons();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.findAddonByIdOrThrow(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAddonDto) {
    return this.catalogService.updateAddon(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.catalogService.deleteAddon(id);
  }

  // ─── Addon Feature mappings ────────────────────────────────────────────

  @Post(':id/features')
  assignFeature(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignFeatureToAddonDto) {
    return this.catalogService.assignFeatureToAddon(id, dto);
  }

  @Get(':id/features')
  getFeatures(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.findAddonFeatures(id);
  }

  @Delete(':id/features/:featureId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFeature(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('featureId', ParseUUIDPipe) featureId: string,
  ) {
    await this.catalogService.removeAddonFeature(id, featureId);
  }
}
