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

import { Subscription } from './subscription.entity';
import { Addon } from '../../catalog/entities/addon.entity';

@Entity('subscription_addons')
@Unique('uq_subscription_addon', ['subscriptionId', 'addonId'])
export class SubscriptionAddon {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Column({ name: 'addon_id', type: 'uuid' })
  addonId!: string;

  @Column({ type: 'integer', default: 1 })
  quantity!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => Subscription, (s) => s.addons, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_id' })
  subscription!: Subscription;

  @ManyToOne(() => Addon, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'addon_id' })
  addon!: Addon;
}
