import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../constants/error-codes';

/**
 * Application-level exception that carries a structured error code and optional details.
 * Throwing AppException from any service or guard guarantees a consistent, typed error
 * response through the global HttpExceptionFilter — no ad-hoc error shaping in controllers.
 */
export class AppException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, statusCode);
  }
}

// Convenience factories for the most common cases

export class NotFoundException extends AppException {
  constructor(resource: string, id?: string) {
    super(
      ErrorCode.NOT_FOUND,
      id ? `${resource} '${id}' not found` : `${resource} not found`,
      HttpStatus.NOT_FOUND,
    );
  }
}

export class ConflictException extends AppException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.RESOURCE_CONFLICT, message, HttpStatus.CONFLICT, details);
  }
}

export class ForbiddenOrganizationAccessException extends AppException {
  constructor() {
    super(
      ErrorCode.FORBIDDEN_ORGANIZATION_ACCESS,
      'Access to this organization is not permitted',
      HttpStatus.FORBIDDEN,
    );
  }
}
