import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';

/**
 * Persisted refresh token record. The raw token is never stored — only the SHA-256 hash.
 *
 * The `family` UUID identifies a session lineage. When a token is rotated, the new token
 * inherits the same family ID. If a revoked token from a family is replayed, the entire
 * family is revoked — this is the reuse detection mechanism.
 *
 * `replacedById` creates an auditable chain of rotations for forensic analysis,
 * but security decisions are based solely on `isRevoked`.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** SHA-256 hex digest of the raw token. Used for constant-time lookup. */
  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash!: string;

  /** Session family identifier — shared across all rotations of the same session. */
  @Column({ type: 'uuid' })
  family!: string;

  @Column({ name: 'is_revoked', type: 'boolean', default: false })
  isRevoked!: boolean;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  /** ID of the token that replaced this one, if it has been rotated. */
  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replacedById!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.refreshTokens)
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
