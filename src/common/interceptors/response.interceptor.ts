import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
  };
}

/**
 * Wraps every successful controller response in the standard success envelope.
 * Controllers return their data directly; this interceptor handles the wrapping,
 * keeping controller code clean of envelope concerns.
 *
 * The exception filter handles the error envelope for thrown exceptions.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<SuccessResponse<T>> {
    const request = context.switchToHttp().getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId ?? 'unknown';

    return next.handle().pipe(
      map((data: T) => ({
        success: true,
        data,
        meta: { requestId },
      })),
    );
  }
}
