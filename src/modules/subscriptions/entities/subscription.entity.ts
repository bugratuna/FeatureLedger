import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { SubscriptionAddon } from './subscription-addon.entity';
import { Plan } from '../../catalog/entities/plan.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { SubscriptionStatus } from '../enums/subscription-status.enum';

@Entity('subscriptions')
@Index('idx_subscriptions_org_status', ['organizationId', 'status'])
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @Column({ type: 'enum', enum: SubscriptionStatus })
  status!: SubscriptionStatus;

  @Column({ name: 'billing_period_start', type: 'timestamptz' })
  billingPeriodStart!: Date;

  @Column({ name: 'billing_period_end', type: 'timestamptz' })
  billingPeriodEnd!: Date;

  @Column({ name: 'cancel_at_period_end', type: 'boolean', default: false })
  cancelAtPeriodEnd!: boolean;

  @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true })
  canceledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @VersionColumn()
  version!: number;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => Plan)
  @JoinColumn({ name: 'plan_id' })
  plan!: Plan;

  @OneToMany(() => SubscriptionAddon, (sa) => sa.subscription, { cascade: ['insert'] })
  addons!: SubscriptionAddon[];
}
