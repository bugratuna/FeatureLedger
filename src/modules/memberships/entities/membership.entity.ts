import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { MembershipRole } from '../enums/membership-role.enum';

/**
 * Represents a user's membership in an organization.
 *
 * The unique constraint on (organization_id, user_id) is enforced both here
 * and in the migration — belt and suspenders for a constraint this important.
 */
@Entity('memberships')
@Unique('uq_membership_org_user', ['organizationId', 'userId'])
export class Membership {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 50 })
  role!: MembershipRole;

  /** Set when the member was invited rather than being the founding owner. */
  @Column({ name: 'invited_by_user_id', type: 'uuid', nullable: true })
  invitedByUserId!: string | null;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt!: Date;

  @ManyToOne(() => Organization, (org) => org.memberships)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => User, (user) => user.memberships)
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
