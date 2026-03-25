import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { AddonFeature } from './addon-feature.entity';

/**
 * An Addon is an à-la-carte feature bundle that tenants can subscribe to
 * independently of their base plan.
 */
@Entity('addons')
export class Addon {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => AddonFeature, (af) => af.addon)
  addonFeatures!: AddonFeature[];
}
