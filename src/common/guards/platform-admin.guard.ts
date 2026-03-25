import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

import { ErrorCode } from '../constants/error-codes';
import { AppException } from '../exceptions/app.exception';

/**
 * Guards routes that require platform-admin privileges.
 *
 * Must be applied AFTER JwtAuthGuard (which populates req.user).
 * Platform admins are identified by the `isPlatformAdmin` claim in their JWT,
 * set at user creation time and not tenant-scoped.
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard, PlatformAdminGuard)
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest<Request>();

    if (!request.user?.isPlatformAdmin) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Platform administrator access required',
        ForbiddenException.prototype.constructor.length ? 403 : 403,
      );
    }

    return true;
  }
}
