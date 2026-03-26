import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { AddonFeature } from './addon-feature.entity';
import { PlanFeature } from './plan-feature.entity';
import { MeterType } from '../enums/meter-type.enum';

/**
 * A Feature is one capability the platform can gate or measure.
 *
 * The `code` field is a stable, machine-readable identifier. It is normalized
 * to lowercase on create. Do not change it after publishing — external systems
 * send usage events by code, so renaming it would break them silently.
 */
@Entity('features')
export class Feature {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Stable lowercase identifier. Examples: "api-calls", "seats", "export-pdf" */
  @Column({ type: 'varchar', length: 100, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** Label shown in UI and reports. Examples: "API calls", "GB", "seats" */
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
