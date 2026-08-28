import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  InvitationStatus,
  Prisma,
  RelationStatus,
  SessionClientType,
  UserStatus,
} from '@prisma/client';
import { BusinessException, PrincipalType, type UserAccessTokenClaims } from '../common';
import { PrismaService } from '../prisma';
import { RedisService } from '../redis';
import { RealtimeService } from '../realtime';
import { PasswordHasherService } from './password-hasher.service';

interface RefreshClaims {
  sub: string;
  type: PrincipalType.USER;
  sessionId: string;
  jti: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TTL_SECONDS = 180 * 24 * 60 * 60;

function opaqueTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashesEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordHasherService,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  async login(account: string, password: string, clientAddress = 'unknown') {
    await this.enforceRateLimit('login', `${clientAddress}:${account.toLowerCase()}`, 10, 60);
    const user = await this.prisma.user.findUnique({ where: { account } });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !(await this.passwords.verify(user.passwordHash, password))
    ) {
      throw new BusinessException('INVALID_CREDENTIALS', '账号或密码错误', HttpStatus.UNAUTHORIZED);
    }

    const tokens = await this.createSession(user.id, SessionClientType.ADMIN_WEB);
    return { ...tokens, user: { id: user.id, name: user.name } };
  }

  async refresh(refreshToken: string, clientAddress = 'unknown'): Promise<TokenPair> {
    await this.enforceRateLimit(
      'refresh',
      `${clientAddress}:${opaqueTokenHash(refreshToken)}`,
      30,
      60,
    );
    const claims = await this.verifyRefreshToken(refreshToken);
    const presentedHash = opaqueTokenHash(refreshToken);

    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: claims.sessionId },
        include: { user: true },
      });
      const now = new Date();
      if (
        !session ||
        session.userId !== claims.sub ||
        session.user.status !== UserStatus.ACTIVE ||
        session.revokedAt ||
        session.expiresAt <= now ||
        !hashesEqual(session.refreshTokenHash, presentedHash)
      ) {
        throw new BusinessException(
          'INVALID_REFRESH_TOKEN',
          'Refresh Token 无效或已失效',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const nextTokens = await this.issueTokenPair(session.userId, session.id);
      const rotated = await transaction.session.updateMany({
        where: {
          id: session.id,
          refreshTokenHash: presentedHash,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          refreshTokenHash: opaqueTokenHash(nextTokens.refreshToken),
          lastUsedAt: now,
        },
      });
      if (rotated.count !== 1) {
        throw new BusinessException(
          'INVALID_REFRESH_TOKEN',
          'Refresh Token 已被轮换',
          HttpStatus.UNAUTHORIZED,
        );
      }
      return nextTokens;
    });
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.realtime?.disconnectSession(sessionId);
  }

  async consumeInvitation(token: string, _deviceName: string, clientAddress = 'unknown') {
    const tokenHash = opaqueTokenHash(token);
    await this.enforceRateLimit('invitation', `${clientAddress}:${tokenHash}`, 10, 60);
    const invitation = await this.prisma.teacherInvitation.findUnique({
      where: { tokenHash },
      include: {
        classTeacher: {
          include: { classroom: true, teacher: true },
        },
      },
    });
    if (!invitation) {
      throw new BusinessException('INVITATION_NOT_FOUND', '邀请不存在', HttpStatus.NOT_FOUND);
    }
    if (invitation.status === InvitationStatus.USED || invitation.usedAt) {
      throw new BusinessException('INVITATION_ALREADY_USED', '邀请已经使用', HttpStatus.CONFLICT);
    }
    if (invitation.status === InvitationStatus.REVOKED) {
      throw new BusinessException('INVITATION_REVOKED', '邀请已经撤销', HttpStatus.GONE);
    }
    if (invitation.status === InvitationStatus.EXPIRED || invitation.expiresAt <= new Date()) {
      await this.prisma.teacherInvitation.updateMany({
        where: { id: invitation.id, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new BusinessException('INVITATION_EXPIRED', '邀请已经过期', HttpStatus.GONE);
    }
    if (
      invitation.classTeacher.status !== RelationStatus.ACTIVE ||
      invitation.classTeacher.teacher.status !== UserStatus.ACTIVE
    ) {
      throw new BusinessException('INVITATION_REVOKED', '教师关系已经失效', HttpStatus.GONE);
    }

    const consumedAt = new Date();
    const result = await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.teacherInvitation.updateMany({
        where: {
          id: invitation.id,
          tokenHash,
          status: InvitationStatus.PENDING,
          usedAt: null,
          expiresAt: { gt: consumedAt },
        },
        data: { status: InvitationStatus.USED, usedAt: consumedAt },
      });
      if (consumed.count !== 1) {
        throw new BusinessException(
          'INVITATION_ALREADY_USED',
          '邀请已经被消费',
          HttpStatus.CONFLICT,
        );
      }
      const tokens = await this.createSessionInTransaction(
        transaction,
        invitation.classTeacher.teacherId,
        SessionClientType.TEACHER_MOBILE,
      );
      return { tokens };
    });

    return {
      ...result.tokens,
      classroom: {
        id: invitation.classTeacher.classroom.id,
        name: invitation.classTeacher.classroom.name,
      },
      teacher: {
        id: invitation.classTeacher.teacher.id,
        name: invitation.classTeacher.teacher.name,
        subject: invitation.classTeacher.subject,
      },
    };
  }

  private async createSession(userId: string, clientType: SessionClientType): Promise<TokenPair> {
    return this.prisma.$transaction((transaction) =>
      this.createSessionInTransaction(transaction, userId, clientType),
    );
  }

  private async createSessionInTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
    clientType: SessionClientType,
  ): Promise<TokenPair> {
    const now = new Date();
    const session = await transaction.session.create({
      data: {
        userId,
        clientType,
        expiresAt: new Date(now.getTime() + REFRESH_TTL_SECONDS * 1000),
        refreshTokenHash: opaqueTokenHash(`pending:${randomUUID()}`),
      },
    });
    const tokens = await this.issueTokenPair(userId, session.id);
    await transaction.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: opaqueTokenHash(tokens.refreshToken) },
    });
    return tokens;
  }

  private async issueTokenPair(userId: string, sessionId: string): Promise<TokenPair> {
    const accessClaims: UserAccessTokenClaims = {
      sub: userId,
      type: PrincipalType.USER,
      sessionId,
    };
    const refreshClaims: RefreshClaims = {
      ...accessClaims,
      jti: randomUUID(),
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessClaims, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
        expiresIn: this.durationSeconds(this.config.getOrThrow<string>('jwt.accessExpiresIn')),
      }),
      this.jwt.signAsync(refreshClaims, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: REFRESH_TTL_SECONDS,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<RefreshClaims> {
    try {
      const claims = await this.jwt.verifyAsync<RefreshClaims>(token, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
      if (claims.type !== PrincipalType.USER || !claims.sub || !claims.sessionId || !claims.jti) {
        throw new Error('Invalid refresh claims');
      }
      return claims;
    } catch {
      throw new BusinessException(
        'INVALID_REFRESH_TOKEN',
        'Refresh Token 无效或已过期',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private durationSeconds(value: string): number {
    const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
    if (!match) {
      throw new Error(`Invalid duration: ${value}`);
    }
    const amount = Number(match[1]);
    const multipliers = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400 } as const;
    const multiplier = multipliers[match[2] as keyof typeof multipliers];
    return Math.max(1, Math.floor(amount * multiplier));
  }

  private async enforceRateLimit(
    scope: string,
    identity: string,
    limit: number,
    windowSeconds: number,
  ): Promise<void> {
    if (!this.redis) return;
    const identityHash = createHash('sha256').update(identity).digest('hex');
    const key = `auth:rate:${scope}:${identityHash}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, windowSeconds);
    }
    if (count > limit) {
      throw new BusinessException(
        'AUTH_RATE_LIMITED',
        '请求过于频繁，请稍后重试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
