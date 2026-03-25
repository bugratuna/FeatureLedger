
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
import { CreateFeatureDto } from '../dto/create-feature.dto';
import { UpdateFeatureDto } from '../dto/update-feature.dto';

@Controller('catalog/features')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class FeaturesController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  create(@Body() dto: CreateFeatureDto) {
    return this.catalogService.createFeature(dto);
  }

  @Get()
  findAll() {
    return this.catalogService.findAllFeatures();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.findFeatureByIdOrThrow(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeatureDto) {
    return this.catalogService.updateFeature(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.catalogService.deleteFeature(id);
  }
}
