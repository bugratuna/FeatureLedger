import { ErrorCode } from '@common/constants/error-codes';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as argon2 from 'argon2';


import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { TokenService } from './services/token.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-id-1',
    email: 'alice@example.com',
    displayName: 'Alice',
    passwordHash: 'hashed',
    isActive: true,
    isPlatformAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    memberships: [],
    refreshTokens: [],
    ...overrides,
  } as User;
}

function makeRefreshToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  const future = new Date();
  future.setDate(future.getDate() + 30);
  return {
    id: 'rt-id-1',
    userId: 'user-id-1',
    tokenHash: 'hash-abc',
    family: 'family-uuid-1',
    isRevoked: false,
    expiresAt: future,
    replacedById: null,
    createdAt: new Date(),
    user: makeUser(),
    ...overrides,
  } as RefreshToken;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let refreshTokenRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    manager: { query: jest.Mock };
  };

  beforeEach(async () => {
    refreshTokenRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      update: jest.fn(),
      manager: { query: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepo,
        },
        {
          provide: UsersService,
          useValue: {
            findByEmailWithPassword: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            generateAccessToken: jest.fn().mockReturnValue('access-token'),
            generateRefreshToken: jest.fn().mockReturnValue({ raw: 'raw-token', hash: 'hash-abc' }),
            generateFamilyId: jest.fn().mockReturnValue('family-uuid-1'),
            hashToken: jest.fn().mockReturnValue('hash-abc'),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('30d') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    usersService = module.get(UsersService) as jest.Mocked<UsersService>;
    // TokenService is mocked above; captured here if needed for future assertions
    module.get(TokenService);
  });

  // ─── Login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns a token pair and user profile on valid credentials', async () => {
      const user = makeUser();
      usersService.findByEmailWithPassword.mockResolvedValue(user);
      jest.spyOn(argon2, 'verify').mockResolvedValue(true);
      refreshTokenRepo.save.mockResolvedValue(makeRefreshToken());

      const result = await service.login({ email: 'alice@example.com', password: 'password123' });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('raw-token');
      expect(result.user.email).toBe('alice@example.com');
      expect(result.user.id).toBe('user-id-1');
    });

    it('throws AUTH_INVALID_CREDENTIALS when user is not found', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null);
      jest.spyOn(argon2, 'verify').mockResolvedValue(false);

      await expect(
        service.login({ email: 'ghost@example.com', password: 'any' }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.AUTH_INVALID_CREDENTIALS });
    });

    it('throws AUTH_INVALID_CREDENTIALS when password is wrong', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(makeUser());
      jest.spyOn(argon2, 'verify').mockResolvedValue(false);

      await expect(
        service.login({ email: 'alice@example.com', password: 'wrong' }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.AUTH_INVALID_CREDENTIALS });
    });

    it('throws AUTH_INVALID_CREDENTIALS for inactive users — even with correct password', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(makeUser({ isActive: false }));
      jest.spyOn(argon2, 'verify').mockResolvedValue(true);

      await expect(
        service.login({ email: 'alice@example.com', password: 'password123' }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.AUTH_INVALID_CREDENTIALS });
    });
  });

  // ─── Refresh ────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('returns a new token pair and invalidates the old token', async () => {
      const oldToken = makeRefreshToken();
      refreshTokenRepo.findOne.mockResolvedValue(oldToken);
      const newToken = makeRefreshToken({ id: 'rt-id-2', tokenHash: 'hash-new' });
      refreshTokenRepo.save
        .mockResolvedValueOnce(newToken) // saving new token
        .mockResolvedValueOnce({ ...oldToken, isRevoked: true }); // saving old token revocation

      const result = await service.refresh('raw-token');

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('raw-token');

      // Old token must be marked revoked
      const secondSaveCall = refreshTokenRepo.save.mock.calls[1][0];
      expect(secondSaveCall.isRevoked).toBe(true);
      expect(secondSaveCall.replacedById).toBe('rt-id-2');
    });

    it('throws AUTH_TOKEN_INVALID when token hash is not found in DB', async () => {
      refreshTokenRepo.findOne.mockResolvedValue(null);

      await expect(service.refresh('unknown-token')).rejects.toMatchObject({
        errorCode: ErrorCode.AUTH_TOKEN_INVALID,
      });
    });

    it('revokes the entire family and throws AUTH_TOKEN_REUSED when a revoked token is presented', async () => {
      const revokedToken = makeRefreshToken({ isRevoked: true, family: 'family-abc' });
      refreshTokenRepo.findOne.mockResolvedValue(revokedToken);

      await expect(service.refresh('raw-token')).rejects.toMatchObject({
        errorCode: ErrorCode.AUTH_TOKEN_REUSED,
      });

      // Family revocation must have been called
      expect(refreshTokenRepo.update).toHaveBeenCalledWith(
        { family: 'family-abc', isRevoked: false },
        { isRevoked: true },
      );
    });

    it('throws AUTH_TOKEN_EXPIRED for tokens past their expiry date', async () => {
      const pastDate = new Date('2020-01-01');
      const expiredToken = makeRefreshToken({ expiresAt: pastDate });
      refreshTokenRepo.findOne.mockResolvedValue(expiredToken);

      await expect(service.refresh('raw-token')).rejects.toMatchObject({
        errorCode: ErrorCode.AUTH_TOKEN_EXPIRED,
      });

      // Expired — not a reuse situation, so family must NOT be revoked
      expect(refreshTokenRepo.update).not.toHaveBeenCalled();
    });
  });

  // ─── Logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('marks the token as revoked', async () => {
      const token = makeRefreshToken();
      refreshTokenRepo.findOne.mockResolvedValue(token);

      await service.logout('raw-token');

      expect(refreshTokenRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isRevoked: true }),
      );
    });

    it('is idempotent — no error when token is not found', async () => {
      refreshTokenRepo.findOne.mockResolvedValue(null);
      await expect(service.logout('unknown-token')).resolves.toBeUndefined();
    });

    it('is idempotent — no error when token is already revoked', async () => {
      refreshTokenRepo.findOne.mockResolvedValue(makeRefreshToken({ isRevoked: true }));
      await service.logout('raw-token');
      // save should NOT be called again for an already-revoked token
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });
  });
});
