import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Attaches a request ID to every inbound request.
 *
 * If an upstream gateway (nginx, load balancer) already sets x-request-id,
 * we honour it so the ID is consistent across the full call chain.
 * Otherwise we generate one here.
 *
 * The ID is written to `req.requestId` so filters and interceptors can include
 * it in response envelopes without needing async context propagation.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const existingId = req.headers['x-request-id'];
    const requestId = typeof existingId === 'string' && existingId ? existingId : uuidv4();

    // Expose on request object for downstream use (filters, interceptors)
    (req as Request & { requestId: string }).requestId = requestId;

    // Echo back so clients can correlate their logs with ours
    res.setHeader('x-request-id', requestId);

    next();
  }
}
