import { createHash, randomBytes } from 'crypto';

import { JwtAccessPayload } from '@common/types/request.types';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';


export interface GeneratedToken {
  /** Raw token returned to the client. Never persisted. */
  raw: string;
  /** SHA-256 hex digest. What gets stored in the database. */
  hash: string;
}

/**
 * Handles all cryptographic token operations.
 * Isolated here so AuthService stays readable and this logic is independently testable.
 *
 * Design decisions:
 * - Refresh tokens: 256 bits of cryptographic randomness (crypto.randomBytes)
 * - Token hashing: SHA-256 — appropriate because tokens already have high entropy.
 *   Argon2 is for passwords (low entropy + user-chosen). SHA-256 is fast enough here.
 * - Access tokens: JWTs signed with HS256 via @nestjs/jwt
 * - Invitation tokens: same approach as refresh tokens — 256-bit random, SHA-256 stored
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  generateAccessToken(payload: JwtAccessPayload): string {
    return this.jwtService.sign(payload);
  }

  generateRefreshToken(): GeneratedToken {
    const raw = randomBytes(32).toString('hex'); // 64 hex chars = 256 bits
    return { raw, hash: this.hashToken(raw) };
  }

  generateInvitationToken(): GeneratedToken {
    const raw = randomBytes(32).toString('hex');
    return { raw, hash: this.hashToken(raw) };
  }

  generateFamilyId(): string {
    return uuidv4();
  }

  /**
   * SHA-256 hex digest. Used to hash tokens before DB storage/lookup.
   * Not suitable for passwords — use Argon2 for those.
   */
  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
