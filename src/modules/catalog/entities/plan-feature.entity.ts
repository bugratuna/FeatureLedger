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

import { Feature } from './feature.entity';
import { Plan } from './plan.entity';
import { OveragePolicy } from '../enums/overage-policy.enum';

/**
 * Links a plan to a feature.
 * Stores how many units are included and what happens when the limit is exceeded.
 */
@Entity('plan_features')
@Unique('uq_plan_feature', ['planId', 'featureId'])
export class PlanFeature {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @Column({ name: 'feature_id', type: 'uuid' })
  featureId!: string;

  /** Units included before overage applies. NULL means no limit. */
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

  @ManyToOne(() => Plan, (p) => p.planFeatures, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan!: Plan;

  @ManyToOne(() => Feature, (f) => f.planFeatures, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'feature_id' })
  feature!: Feature;
}
