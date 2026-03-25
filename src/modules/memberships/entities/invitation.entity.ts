import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { MembershipRole } from '../enums/membership-role.enum';

/**
 * An invitation to join an organization. The raw token is returned once on creation
 * and sent to the invitee (via email in production). Only the SHA-256 hash is persisted.
 *
 * Invitations expire and are single-use — acceptedAt is set on acceptance and
 * the token cannot be reused.
 */
@Entity('invitations')
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  /** The email address the invitation is addressed to. Must match accepting user's email. */
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 50 })
  role!: MembershipRole;

  /**
   * SHA-256 hash of the raw invitation token.
   * The raw token is sent to the invitee; only this hash is stored.
   */
  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash!: string;

  @Column({ name: 'invited_by_user_id', type: 'uuid' })
  invitedByUserId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'invited_by_user_id' })
  invitedByUser!: User;
}
