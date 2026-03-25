import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { Membership } from '../../memberships/entities/membership.entity';

/**
 * Core identity record. Normalized email is the lookup key.
 *
 * passwordHash is never selected by default — callers must explicitly include it
 * when they need it (i.e., during login). This prevents accidental exposure.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 320, unique: true })
  email!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 255 })
  displayName!: string;

  /**
   * Argon2id hash. Never returned from the API.
   * select: false means TypeORM excludes this column from queries unless explicitly requested.
   */
  @Column({ name: 'password_hash', type: 'varchar', select: false })
  passwordHash!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /**
   * Platform admin flag gates catalog management routes (Phase 2).
   * Kept as a flat flag rather than a role to avoid polluting the org role model.
   */
  @Column({ name: 'is_platform_admin', type: 'boolean', default: false })
  isPlatformAdmin!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relations (loaded explicitly, never eagerly)
  @OneToMany(() => Membership, (m) => m.user)
  memberships!: Membership[];

  @OneToMany(() => RefreshToken, (rt) => rt.user)
  refreshTokens!: RefreshToken[];
}
