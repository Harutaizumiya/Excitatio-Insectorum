import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { BusinessException } from '../exceptions/business.exception';
import type { RequestContext } from '../interfaces/request-context';

interface ErrorBody {
  code: string;
  message: string;
  requestId: string;
}

const statusCodeNames: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestContext>();
    const response = context.getResponse<Response>();
    const requestId =
      request.requestId ?? (request.id === undefined ? randomUUID() : String(request.id));

    const { status, code, message } = this.normalizeException(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(`Unhandled request error (${requestId})`, stack);
    }

    response.status(status).json({ code, message, requestId } satisfies ErrorBody);
  }

  private normalizeException(exception: unknown): Omit<ErrorBody, 'requestId'> & {
    status: number;
  } {
    if (exception instanceof BusinessException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const objectBody = typeof body === 'object' && body !== null ? body : undefined;
      const responseCode = objectBody && 'code' in objectBody ? objectBody.code : undefined;
      const responseMessage = objectBody && 'message' in objectBody ? objectBody.message : body;

      return {
        status,
        code:
          typeof responseCode === 'string'
            ? responseCode
            : (statusCodeNames[status as HttpStatus] ?? `HTTP_${status}`),
        message: this.toMessage(responseMessage, exception.message),
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: '服务器内部错误',
    };
  }

  private toMessage(value: unknown, fallback: string): string {
    if (Array.isArray(value)) {
      return value.map(String).join('; ');
    }

    return typeof value === 'string' ? value : fallback;
  }
}
