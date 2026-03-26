import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

import { ErrorCode } from '../constants/error-codes';
import { AppException } from '../exceptions/app.exception';

/**
 * Allows only platform admins to access the route.
 *
 * Must run after JwtAuthGuard, which sets req.user.
 * The isPlatformAdmin flag comes from the JWT and is not tied to any org.
 *
 * Usage: @UseGuards(JwtAuthGuard, PlatformAdminGuard)
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
