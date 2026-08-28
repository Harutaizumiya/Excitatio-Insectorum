import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { RequestContext } from '../interfaces/request-context';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestContext, response: Response, next: NextFunction): void {
    const providedId = request.header('x-request-id');
    const loggerRequestId = request.id === undefined ? undefined : String(request.id);
    const requestId = providedId?.trim() || loggerRequestId || randomUUID();

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
