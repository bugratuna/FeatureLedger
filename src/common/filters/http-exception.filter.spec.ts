import { HttpException, HttpStatus , ArgumentsHost } from '@nestjs/common';

import { HttpExceptionFilter } from './http-exception.filter';
import { ErrorCode } from '../constants/error-codes';
import { AppException } from '../exceptions/app.exception';

function buildMockHost(overrides: { requestId?: string } = {}): ArgumentsHost {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const getResponse = jest.fn().mockReturnValue({ status });
  const getRequest = jest
    .fn()
    .mockReturnValue({ requestId: overrides.requestId ?? 'test-request-id', url: '/', method: 'POST' });
  const switchToHttp = jest.fn().mockReturnValue({ getResponse, getRequest });

  return { switchToHttp } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('formats AppException with error code and details', () => {
    const host = buildMockHost();
    const exception = new AppException(
      ErrorCode.QUOTA_EXCEEDED,
      'Monthly export quota exceeded',
      HttpStatus.FORBIDDEN,
      { featureCode: 'report_exports', limit: 5000, consumed: 5000 },
    );

    filter.catch(exception, host);

    const json = (host.switchToHttp().getResponse().status as jest.Mock).mock.results[0].value.json;
    const [body] = (json as jest.Mock).mock.calls[0];

    expect(body.success).toBe(false);
    expect(body.error.code).toBe(ErrorCode.QUOTA_EXCEEDED);
    expect(body.error.message).toBe('Monthly export quota exceeded');
    expect(body.error.details.featureCode).toBe('report_exports');
    expect(body.meta.requestId).toBe('test-request-id');
  });

  it('formats HttpException with mapped error code', () => {
    const host = buildMockHost();
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

    filter.catch(exception, host);

    const json = (host.switchToHttp().getResponse().status as jest.Mock).mock.results[0].value.json;
    const [body] = (json as jest.Mock).mock.calls[0];

    expect(body.success).toBe(false);
    expect(body.error.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('formats unknown errors as INTERNAL_ERROR with safe message', () => {
    const host = buildMockHost();
    const exception = new Error('DB connection pool exhausted — internal detail');

    filter.catch(exception, host);

    const json = (host.switchToHttp().getResponse().status as jest.Mock).mock.results[0].value.json;
    const [body] = (json as jest.Mock).mock.calls[0];

    expect(body.success).toBe(false);
    expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    // Must not leak internal error details over the wire
    expect(body.error.message).toBe('An unexpected error occurred');
    expect(JSON.stringify(body)).not.toContain('pool exhausted');
  });

  it('preserves validation error detail array from ValidationPipe', () => {
    const host = buildMockHost();
    const exception = new HttpException(
      { message: ['email must be an email', 'password must be longer than 8 characters'], error: 'Bad Request' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    const json = (host.switchToHttp().getResponse().status as jest.Mock).mock.results[0].value.json;
    const [body] = (json as jest.Mock).mock.calls[0];

    expect(body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.error.details.errors).toContain('email must be an email');
  });
});
