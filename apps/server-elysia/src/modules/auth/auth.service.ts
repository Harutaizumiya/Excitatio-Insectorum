import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { compare } from 'bcryptjs';
import {
  InvitationStatus,
  Prisma,
  RelationStatus,
  SessionClientType,
  UserStatus,
} from '@prisma/client';
import { prisma } from '../../plugins/prisma';
import { config } from '../../config';
import { BusinessError } from '../../plugins/error-handler';
import { PrincipalType, type UserAccessTokenClaims } from '../../plugins/auth';
import { realtimeService } from '../realtime/realtime.service';

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

function parseDuration(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) return 900; // default 15m
  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return value;
  }
}

export class AuthService {
  async login(account: string, passwordPlain: string) {
    const user = await prisma.user.findUnique({ where: { account } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new BusinessError('INVALID_CREDENTIALS', '账号或密码错误', 401);
    }

    const valid = await compare(passwordPlain, user.passwordHash);
    if (!valid) {
      throw new BusinessError('INVALID_CREDENTIALS', '账号或密码错误', 401);
    }

    const tokens = await this.createSession(user.id, SessionClientType.ADMIN_WEB);
    return { ...tokens, user: { id: user.id, name: user.name } };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const claims = this.verifyRefreshToken(refreshToken);
    const presentedHash = opaqueTokenHash(refreshToken);

    return prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
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
        throw new BusinessError('INVALID_REFRESH_TOKEN', 'Refresh Token 无效或已失效', 401);
      }

      const nextTokens = await this.issueTokenPair(session.userId, session.id);
      const rotated = await tx.session.updateMany({
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
        throw new BusinessError('INVALID_REFRESH_TOKEN', 'Refresh Token 已被轮换', 401);
      }
      return nextTokens;
    });
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    realtimeService.disconnectSession(sessionId);
  }

  async consumeInvitation(token: string, deviceName?: string) {
    void deviceName;
    const tokenHash = opaqueTokenHash(token);
    const invitation = await prisma.teacherInvitation.findUnique({
      where: { tokenHash },
      include: {
        classTeacher: {
          include: { classroom: true, teacher: true },
        },
      },
    });

    if (!invitation) {
      throw new BusinessError('INVITATION_NOT_FOUND', '邀请不存在', 404);
    }
    if (invitation.status === InvitationStatus.USED || invitation.usedAt) {
      throw new BusinessError('INVITATION_ALREADY_USED', '邀请已经使用', 409);
    }
    if (invitation.status === InvitationStatus.REVOKED) {
      throw new BusinessError('INVITATION_REVOKED', '邀请已经撤销', 410);
    }
    if (invitation.status === InvitationStatus.EXPIRED || invitation.expiresAt <= new Date()) {
      await prisma.teacherInvitation.updateMany({
        where: { id: invitation.id, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new BusinessError('INVITATION_EXPIRED', '邀请已经过期', 410);
    }
    if (
      invitation.classTeacher.status !== RelationStatus.ACTIVE ||
      invitation.classTeacher.teacher.status !== UserStatus.ACTIVE
    ) {
      throw new BusinessError('INVITATION_REVOKED', '教师关系已经失效', 410);
    }

    const consumedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const consumed = await tx.teacherInvitation.updateMany({
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
        throw new BusinessError('INVITATION_ALREADY_USED', '邀请已经被消费', 409);
      }

      const tokens = await this.createSessionInTransaction(
        tx,
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
    return prisma.$transaction((tx) => this.createSessionInTransaction(tx, userId, clientType));
  }

  private async createSessionInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    clientType: SessionClientType,
  ): Promise<TokenPair> {
    const now = new Date();
    const session = await tx.session.create({
      data: {
        userId,
        clientType,
        expiresAt: new Date(now.getTime() + REFRESH_TTL_SECONDS * 1000),
        refreshTokenHash: opaqueTokenHash(`pending:${randomUUID()}`),
      },
    });
    const tokens = await this.issueTokenPair(userId, session.id);
    await tx.session.update({
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

    const accessToken = jwt.sign(accessClaims, config.jwtAccessSecret, {
      expiresIn: parseDuration(config.jwtAccessExpiresIn),
    });
    const refreshToken = jwt.sign(refreshClaims, config.jwtRefreshSecret, {
      expiresIn: parseDuration('180d'),
    });

    return { accessToken, refreshToken };
  }

  private verifyRefreshToken(token: string): RefreshClaims {
    try {
      const claims = jwt.verify(token, config.jwtRefreshSecret) as RefreshClaims;
      if (claims.type !== PrincipalType.USER || !claims.sessionId || !claims.jti) {
        throw new Error('Invalid payload');
      }
      return claims;
    } catch {
      throw new BusinessError('INVALID_REFRESH_TOKEN', 'Refresh Token 无效或已失效', 401);
    }
  }
}

export const authService = new AuthService();
