import { Elysia } from 'elysia';
import { randomUUID } from 'node:crypto';

export class BusinessError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, BusinessError.prototype);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyErrorHandler<T extends Elysia<any, any, any, any, any, any, any>>(app: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return app
    .error({ BusinessError })
    .onError(({ code, error, request }) => {
      const requestId =
        request.headers.get('x-request-id') ||
        request.headers.get('request-id') ||
        randomUUID();

      if (error && typeof error === 'object' && 'code' in error) {
        const biz = error as BusinessError;
        return Response.json(
          {
            code: biz.code,
            message: biz.message,
            requestId,
          },
          {
            status: biz.status || 400,
          },
        );
      }

      if (code === 'VALIDATION') {
        return Response.json(
          {
            code: 'VALIDATION_FAILED',
            message: (error as { message?: string })?.message || '请求参数校验失败',
            requestId,
          },
          {
            status: 400,
          },
        );
      }

      if (code === 'PARSE') {
        return Response.json(
          {
            code: 'BAD_REQUEST',
            message: '无法解析请求数据',
            requestId,
          },
          {
            status: 400,
          },
        );
      }

      if (code === 'NOT_FOUND') {
        return Response.json(
          {
            code: 'NOT_FOUND',
            message: '未找到对应路由或资源',
            requestId,
          },
          {
            status: 404,
          },
        );
      }

      console.error(`[Elysia] Unhandled error (${requestId}):`, error);
      return Response.json(
        {
          code: 'INTERNAL_SERVER_ERROR',
          message: '服务器内部错误',
          requestId,
        },
        {
          status: 500,
        },
      );
    }) as unknown as T;
}

export const errorHandlerPlugin = new Elysia({ name: 'plugin.error-handler' })
  .error({ BusinessError });
