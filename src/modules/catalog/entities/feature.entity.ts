import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { AddonFeature } from './addon-feature.entity';
import { PlanFeature } from './plan-feature.entity';
import { MeterType } from '../enums/meter-type.enum';

/**
 * A Feature represents one measurable or gateable capability in the platform.
 *
 * The `code` field is the stable, machine-readable identifier used throughout
 * the metering pipeline. It is normalized to lowercase kebab-case at creation
 * time and is immutable after creation — changing a code would silently break
 * any integration that records usage events against it.
 */
@Entity('features')
export class Feature {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Normalized, forever-stable machine identifier.
   * Example: "api-calls", "seats", "export-pdf"
   */
  @Column({ type: 'varchar', length: 100, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /**
   * Human-readable unit label shown in UI and reports.
   * Example: "API calls", "GB", "seats"
   */
  @Column({ name: 'unit_label', type: 'varchar', length: 100, nullable: true })
  unitLabel!: string | null;

  @Column({ name: 'meter_type', type: 'enum', enum: MeterType })
  meterType!: MeterType;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => PlanFeature, (pf) => pf.feature)
  planFeatures!: PlanFeature[];

  @OneToMany(() => AddonFeature, (af) => af.feature)
  addonFeatures!: AddonFeature[];
}
