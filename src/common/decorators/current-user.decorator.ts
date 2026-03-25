import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

import { AuthenticatedUser } from '../types/request.types';

/**
 * Extracts the authenticated user from the request.
 * Must be used on endpoints protected by JwtAuthGuard.
 *
 * @example
 * @Get('me')
 * getMe(@CurrentUser() user: AuthenticatedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return request.user!;
  },
);
