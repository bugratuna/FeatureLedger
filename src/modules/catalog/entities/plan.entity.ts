import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { PlanFeature } from './plan-feature.entity';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /**
   * URL-safe unique identifier derived from name at creation.
   * Immutable after creation — used as stable key in webhooks and integrations.
   */
  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /**
   * Inactive plans are not subscribable but are preserved for historical records.
   */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => PlanFeature, (pf) => pf.plan)
  planFeatures!: PlanFeature[];
}
