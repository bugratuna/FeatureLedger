import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { ErrorCode } from '../constants/error-codes';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../exceptions/app.exception';
import { JwtAccessPayload } from '../types/request.types';

/**
 * Guards routes that require a valid JWT access token.
 *
 * Reads the Bearer token from the Authorization header, verifies it with
 * JwtService, and attaches the decoded payload as req.user.
 *
 * Routes decorated with @Public() bypass this guard entirely.
 *
 * We deliberately avoid Passport.js here — explicit guard logic is easier
 * to read, test, and reason about than the strategy/serialize/deserialize dance.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const request = ctx.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'No access token provided',
        UnauthorizedException.prototype.constructor.length ? 401 : 401,
      );
    }

    try {
      const payload = this.jwtService.verify<JwtAccessPayload>(token);
      request.user = {
        id: payload.sub,
        email: payload.email,
        isPlatformAdmin: payload.isPlatformAdmin ?? false,
      };
      return true;
    } catch {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Invalid or expired access token',
        401,
      );
    }
  }

  private extractBearerToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }
}
