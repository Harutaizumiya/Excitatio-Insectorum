import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InvitationStatus, RelationStatus, UserStatus } from '@prisma/client';
import { BusinessException, PrincipalType } from '../common';
import { PrismaService } from '../prisma';
import { AuthService } from './auth.service';
import { PasswordHasherService } from './password-hasher.service';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('AuthService', () => {
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'jwt.accessSecret': 'access-secret',
        'jwt.accessExpiresIn': '15m',
        'jwt.refreshSecret': 'refresh-secret',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
  const passwords = { verify: jest.fn(), hash: jest.fn() } as unknown as PasswordHasherService;

  it('rotates the refresh hash and rejects reuse of the previous token', async () => {
    const oldToken = 'old-refresh-token';
    const session = {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: sha256(oldToken),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { status: UserStatus.ACTIVE },
    };
    const transaction = {
      session: {
        findUnique: jest.fn(async () => session),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { refreshTokenHash: string };
            data: { refreshTokenHash: string };
          }) => {
            if (where.refreshTokenHash !== session.refreshTokenHash) return { count: 0 };
            session.refreshTokenHash = data.refreshTokenHash;
            return { count: 1 };
          },
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as unknown as PrismaService;
    const jwt = {
      verifyAsync: jest.fn(async () => ({
        sub: 'user-1',
        type: PrincipalType.USER,
        sessionId: 'session-1',
        jti: 'old-jti',
      })),
      signAsync: jest.fn(async (claims: { jti?: string }) =>
        claims.jti ? `new-refresh-${claims.jti}` : 'new-access',
      ),
    } as unknown as JwtService;
    const service = new AuthService(prisma, jwt, config, passwords);

    const rotated = await service.refresh(oldToken);
    expect(rotated.refreshToken).toMatch(/^new-refresh-/);
    expect(session.refreshTokenHash).toBe(sha256(rotated.refreshToken));

    await expect(service.refresh(oldToken)).rejects.toMatchObject<Partial<BusinessException>>({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('consumes an invitation once and rejects the second consumption', async () => {
    const rawToken = 'one-time-token';
    const invitation = {
      id: 'invitation-1',
      tokenHash: sha256(rawToken),
      status: InvitationStatus.PENDING as InvitationStatus,
      usedAt: null as Date | null,
      expiresAt: new Date(Date.now() + 60_000),
      classTeacher: {
        teacherId: 'teacher-1',
        subject: '数学',
        status: RelationStatus.ACTIVE,
        classroom: { id: 'class-1', name: '一班' },
        teacher: { id: 'teacher-1', name: '李老师', status: UserStatus.ACTIVE },
      },
    };
    const transaction = {
      teacherInvitation: {
        updateMany: jest.fn(async () => {
          if (invitation.status !== InvitationStatus.PENDING) return { count: 0 };
          invitation.status = InvitationStatus.USED;
          invitation.usedAt = new Date();
          return { count: 1 };
        }),
      },
      session: {
        create: jest.fn(async () => ({ id: 'session-1' })),
        update: jest.fn(async () => ({})),
      },
    };
    const prisma = {
      teacherInvitation: {
        findUnique: jest.fn(async () => invitation),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as unknown as PrismaService;
    const jwt = {
      signAsync: jest.fn(async (claims: { jti?: string }) =>
        claims.jti ? `refresh-${claims.jti}` : 'access-token',
      ),
    } as unknown as JwtService;
    const service = new AuthService(prisma, jwt, config, passwords);

    await expect(service.consumeInvitation(rawToken, 'Safari')).resolves.toMatchObject({
      classroom: { id: 'class-1' },
      teacher: { id: 'teacher-1' },
    });
    await expect(service.consumeInvitation(rawToken, 'Safari')).rejects.toMatchObject<
      Partial<BusinessException>
    >({ code: 'INVITATION_ALREADY_USED' });
  });

  it('rate limits login attempts before querying credentials', async () => {
    const prisma = {
      user: { findUnique: jest.fn() },
    } as unknown as PrismaService;
    const jwt = {} as JwtService;
    const redis = {
      client: {
        incr: jest.fn().mockResolvedValue(11),
        expire: jest.fn(),
      },
    };
    const service = new AuthService(prisma, jwt, config, passwords, redis as never);

    await expect(service.login('teacher01', 'wrong-password', '127.0.0.1')).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
      status: 429,
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
