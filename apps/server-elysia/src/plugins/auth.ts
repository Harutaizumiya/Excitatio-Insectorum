import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { prisma } from './prisma';

export enum PrincipalType {
  USER = 'USER',
  DISPLAY_DEVICE = 'DISPLAY_DEVICE',
}

export interface UserAccessTokenClaims {
  sub: string;
  type: PrincipalType.USER;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface DisplayAccessTokenClaims {
  sub: string;
  type: PrincipalType.DISPLAY_DEVICE;
  classId: string;
  iat?: number;
  exp?: number;
}

export type AccessTokenClaims = UserAccessTokenClaims | DisplayAccessTokenClaims;

export const authPlugin = new Elysia({ name: 'plugin.auth' })
  .use(
    jwt({
      name: 'jwt',
      secret: config.jwtAccessSecret,
    }),
  )
  .derive({ as: 'scoped' }, async ({ jwt, headers }) => {
    const authHeader = headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        user: null as UserAccessTokenClaims | null,
        displayDevice: null as DisplayAccessTokenClaims | null,
        principal: null as AccessTokenClaims | null,
      };
    }

    const token = authHeader.slice(7).trim();
    const payload = (await jwt.verify(token)) as unknown as AccessTokenClaims | false;
    if (!payload) {
      return {
        user: null,
        displayDevice: null,
        principal: null,
      };
    }

    if (payload.type === PrincipalType.DISPLAY_DEVICE) {
      const device = await prisma.displayDevice.findFirst({
        where: { id: payload.sub, classId: payload.classId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!device) {
        return {
          user: null,
          displayDevice: null,
          principal: null,
          authError: {
            code: 'DEVICE_ACCESS_REVOKED',
            message: '大屏设备凭证已经失效',
            status: 401,
          },
        };
      }
      return {
        user: null,
        displayDevice: payload,
        principal: payload,
      };
    }

    if (payload.type === PrincipalType.USER && payload.sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: payload.sessionId },
        include: { user: { select: { status: true } } },
      });

      if (
        !session ||
        session.userId !== payload.sub ||
        session.user.status !== 'ACTIVE' ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      ) {
        return {
          user: null,
          displayDevice: null,
          principal: null,
          authError: { code: 'SESSION_REVOKED', message: '登录会话已经失效', status: 401 },
        };
      }

      return {
        user: payload,
        displayDevice: null,
        principal: payload,
      };
    }

    return {
      user: null,
      displayDevice: null,
      principal: null,
    };
  })
  .macro({
    requireAuth(required: boolean = true) {
      if (!required) return;
      return {
        beforeHandle({ user, displayDevice, authError, status, request }) {
          if (authError) {
            const requestId = request.headers.get('x-request-id') || randomUUID();
            return status(authError.status, {
              code: authError.code,
              message: authError.message,
              requestId,
            });
          }
          if (!user && !displayDevice) {
            const requestId = request.headers.get('x-request-id') || randomUUID();
            return status(401, {
              code: 'UNAUTHORIZED',
              message: '未提供有效认证凭证',
              requestId,
            });
          }
        },
      };
    },
    requireUser(required: boolean = true) {
      if (!required) return;
      return {
        beforeHandle({ user, authError, status, request }) {
          if (authError) {
            const requestId = request.headers.get('x-request-id') || randomUUID();
            return status(authError.status, {
              code: authError.code,
              message: authError.message,
              requestId,
            });
          }
          if (!user) {
            const requestId = request.headers.get('x-request-id') || randomUUID();
            return status(401, {
              code: 'UNAUTHORIZED',
              message: '需要用户登录凭证',
              requestId,
            });
          }
        },
      };
    },
    requireDisplayDevice(required: boolean = true) {
      if (!required) return;
      return {
        beforeHandle({ displayDevice, authError, status, request }) {
          if (authError) {
            const requestId = request.headers.get('x-request-id') || randomUUID();
            return status(authError.status, {
              code: authError.code,
              message: authError.message,
              requestId,
            });
          }
          if (!displayDevice) {
            const requestId = request.headers.get('x-request-id') || randomUUID();
            return status(401, {
              code: 'DISPLAY_DEVICE_REVOKED',
              message: '设备未绑定或已吊销',
              requestId,
            });
          }
        },
      };
    },
  });
