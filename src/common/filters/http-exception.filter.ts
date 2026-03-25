import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { ErrorCode } from '../constants/error-codes';
import { AppException } from '../exceptions/app.exception';

/**
 * Global exception filter. Normalises all thrown errors — NestJS HttpExceptions,
 * domain AppExceptions, and unexpected runtime errors — into the standard
 * error envelope so clients always receive a consistent shape.
 *
 * Unexpected errors are logged with full context but returned with a safe generic
 * message. We never leak stack traces or internal details over the wire.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const requestId = request.requestId ?? 'unknown';

    if (exception instanceof AppException) {
      response.status(exception.getStatus()).json({
        success: false,
        error: {
          code: exception.errorCode,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
        meta: { requestId },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // ValidationPipe produces a structured body; preserve the detail array
      const isValidationError =
        status === HttpStatus.BAD_REQUEST &&
        typeof body === 'object' &&
        body !== null &&
        'message' in body;

      response.status(status).json({
        success: false,
        error: {
          code: this.codeForStatus(status),
          message: isValidationError
            ? 'Request validation failed'
            : typeof body === 'string'
              ? body
              : exception.message,
          ...(isValidationError
            ? { details: { errors: (body as { message: unknown }).message } }
            : {}),
        },
        meta: { requestId },
      });
      return;
    }

    // Unknown / unexpected error — log it, respond safely
    this.logger.error({
      msg: 'Unhandled exception',
      requestId,
      path: request.url,
      method: request.method,
      error: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
      },
      meta: { requestId },
    });
  }

  private codeForStatus(status: HttpStatus): ErrorCode {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.AUTH_TOKEN_INVALID;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.RESOURCE_CONFLICT;
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
