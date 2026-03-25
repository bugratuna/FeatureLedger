import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Membership } from '../../memberships/entities/membership.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /**
   * URL-safe unique identifier for the organization.
   * Auto-derived from name at creation if not provided: "Acme Corp" → "acme-corp".
   * Immutable after creation to prevent breaking URLs and external references.
   */
  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => Membership, (m) => m.organization)
  memberships!: Membership[];
}
