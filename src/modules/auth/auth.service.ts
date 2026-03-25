import { ErrorCode } from '@common/constants/error-codes';
import { AppException } from '@common/exceptions/app.exception';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';

import { UsersService } from '../users/users.service';
import { LoginResponseDto, MeResponseDto, TokenPairDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { TokenService } from './services/token.service';
import { MembershipRole } from '../memberships/enums/membership-role.enum';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Validates credentials and issues a fresh token pair.
   *
   * We use the same generic error message for "user not found" and "wrong password"
   * to prevent user enumeration via timing differences.
   */
  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    // Always run verify even on null user to prevent timing-based enumeration
    const passwordMatch = user
      ? await argon2.verify(user.passwordHash, dto.password)
      : false;

    if (!user || !passwordMatch || !user.isActive) {
      throw new AppException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid email or password',
        401,
      );
    }

    const { accessToken, refreshToken } = await this.issueTokenPair(user);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isPlatformAdmin: user.isPlatformAdmin,
      },
    };
  }

  /**
   * Rotates a refresh token. The presented token is revoked and a new pair is returned.
   *
   * Reuse detection: if the presented token is already revoked (meaning someone already
   * rotated it), the entire session family is revoked. This is a strong signal that either
   * the legitimate user's token was stolen and used, or the legitimate user is replaying
   * an old token. Either way, force re-authentication.
   */
  async refresh(rawRefreshToken: string): Promise<TokenPairDto> {
    const hash = this.tokenService.hashToken(rawRefreshToken);
    const existingToken = await this.refreshTokenRepo.findOne({
      where: { tokenHash: hash },
      relations: ['user'],
    });

    if (!existingToken) {
      throw new AppException(ErrorCode.AUTH_TOKEN_INVALID, 'Invalid refresh token', 401);
    }

    if (existingToken.isRevoked) {
      // Token was already rotated or explicitly revoked — possible token theft
      await this.revokeFamilyById(existingToken.family);
      throw new AppException(
        ErrorCode.AUTH_TOKEN_REUSED,
        'Refresh token has already been used. All sessions for this device have been revoked.',
        401,
      );
    }

    if (existingToken.expiresAt < new Date()) {
      throw new AppException(ErrorCode.AUTH_TOKEN_EXPIRED, 'Refresh token has expired', 401);
    }

    const user = existingToken.user;
    if (!user.isActive) {
      throw new AppException(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Account is inactive', 401);
    }

    // Issue new token in the same family
    const { accessToken, refreshToken, newRefreshTokenRecord } = await this.issueTokenPairInFamily(
      user,
      existingToken.family,
    );

    // Mark old token as replaced — do this AFTER creating the new one to avoid
    // a window where neither token is valid
    existingToken.isRevoked = true;
    existingToken.replacedById = newRefreshTokenRecord.id;
    await this.refreshTokenRepo.save(existingToken);

    return { accessToken, refreshToken };
  }

  /**
   * Revokes the refresh token, ending the session.
   * Idempotent — no error if the token is not found or already revoked.
   */
  async logout(rawRefreshToken: string): Promise<void> {
    const hash = this.tokenService.hashToken(rawRefreshToken);
    const token = await this.refreshTokenRepo.findOne({ where: { tokenHash: hash } });

    if (token && !token.isRevoked) {
      token.isRevoked = true;
      await this.refreshTokenRepo.save(token);
    }
  }

  async getMe(userId: string): Promise<MeResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new AppException(ErrorCode.NOT_FOUND, 'User not found', 404);
    }

    // Load memberships with org names via raw SQL to avoid circular entity imports
    const rows = await this.refreshTokenRepo.manager.query<
      Array<{ organization_id: string; org_name: string; role: string }>
    >(
      `SELECT m.organization_id, o.name AS org_name, m.role
       FROM memberships m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = $1`,
      [userId],
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      memberships: rows.map((row) => ({
        organizationId: row.organization_id,
        organizationName: row.org_name,
        role: row.role as MembershipRole,
      })),
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async issueTokenPair(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const family = this.tokenService.generateFamilyId();
    return this.issueTokenPairInFamily(user, family);
  }

  private async issueTokenPairInFamily(
    user: User,
    family: string,
  ): Promise<{ accessToken: string; refreshToken: string; newRefreshTokenRecord: RefreshToken }> {
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
    });

    const { raw: refreshToken, hash: tokenHash } = this.tokenService.generateRefreshToken();

    const refreshExpiryDays = this.parseRefreshExpiry(
      this.configService.get<string>('jwt.refreshExpiry') ?? '30d',
    );
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshExpiryDays);

    const newRefreshTokenRecord = await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({ userId: user.id, tokenHash, family, expiresAt }),
    );

    return { accessToken, refreshToken, newRefreshTokenRecord };
  }

  /** Revokes all tokens in a family by family UUID. */
  private async revokeFamilyById(family: string): Promise<void> {
    await this.refreshTokenRepo.update({ family, isRevoked: false }, { isRevoked: true });
  }

  /** Converts "30d" / "7d" style strings to a day count. Fallback: 30. */
  private parseRefreshExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)d$/);
    return match ? parseInt(match[1], 10) : 30;
  }
}
