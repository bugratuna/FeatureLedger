import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { Addon } from './addon.entity';
import { Feature } from './feature.entity';
import { OveragePolicy } from '../enums/overage-policy.enum';

@Entity('addon_features')
@Unique('uq_addon_feature', ['addonId', 'featureId'])
export class AddonFeature {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'addon_id', type: 'uuid' })
  addonId!: string;

  @Column({ name: 'feature_id', type: 'uuid' })
  featureId!: string;

  @Column({ name: 'included_limit', type: 'integer', nullable: true })
  includedLimit!: number | null;

  @Column({
    name: 'overage_policy',
    type: 'enum',
    enum: OveragePolicy,
    default: OveragePolicy.Deny,
  })
  overagePolicy!: OveragePolicy;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => Addon, (a) => a.addonFeatures, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'addon_id' })
  addon!: Addon;

  @ManyToOne(() => Feature, (f) => f.addonFeatures, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'feature_id' })
  feature!: Feature;
}
