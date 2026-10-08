import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { compare } from 'bcryptjs';
import {
  InvitationStatus,
  Prisma,
  PrismaClient,
  RelationStatus,
  SessionClientType,
  TeacherInvitationPurpose,
  TeacherRole,
  UserStatus,
} from '@prisma/client';
import { prisma } from '../../plugins/prisma';
import { config, type AppConfig } from '../../config';
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

interface WechatIdentity {
  appId: string;
  openId: string;
}

type WechatCodeExchange = (code: string, settings: AppConfig) => Promise<WechatIdentity>;
type WechatCodeGenerator = (scene: string, settings: AppConfig) => Promise<string>;

async function exchangeWechatCode(code: string, settings: AppConfig): Promise<WechatIdentity> {
  const endpoint = new URL('https://api.weixin.qq.com/sns/jscode2session');
  endpoint.search = new URLSearchParams({
    appid: settings.wechatAppId,
    secret: settings.wechatAppSecret,
    js_code: code,
    grant_type: 'authorization_code',
  }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.wechatRequestTimeoutMs);

  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) throw new Error('WeChat exchange failed');
    const payload = (await response.json()) as { openid?: unknown; errcode?: unknown };
    if (
      (payload.errcode !== undefined && payload.errcode !== 0) ||
      typeof payload.openid !== 'string' ||
      payload.openid.length === 0
    ) {
      throw new Error('WeChat exchange failed');
    }
    return { appId: settings.wechatAppId, openId: payload.openid };
  } catch {
    throw new BusinessError('WECHAT_LOGIN_FAILED', '微信登录暂不可用，请稍后重试', 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWechatMiniProgramCode(scene: string, settings: AppConfig): Promise<string> {
  try {
    const tokenUrl = new URL('https://api.weixin.qq.com/cgi-bin/token');
    tokenUrl.search = new URLSearchParams({
      grant_type: 'client_credential',
      appid: settings.wechatAppId,
      secret: settings.wechatAppSecret,
    }).toString();
    const tokenResponse = await fetch(tokenUrl, {
      signal: AbortSignal.timeout(settings.wechatRequestTimeoutMs),
    });
    if (!tokenResponse.ok) throw new Error('WeChat token request failed');
    const tokenPayload = (await tokenResponse.json()) as { access_token?: unknown };
    if (typeof tokenPayload.access_token !== 'string' || !tokenPayload.access_token) {
      throw new Error('WeChat token request failed');
    }

    const codeUrl = new URL('https://api.weixin.qq.com/wxa/getwxacodeunlimit');
    codeUrl.searchParams.set('access_token', tokenPayload.access_token);
    const codeResponse = await fetch(codeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scene,
        page: 'pages/login/index',
        check_path: false,
        env_version: settings.wechatMiniProgramEnvVersion,
      }),
      signal: AbortSignal.timeout(settings.wechatRequestTimeoutMs),
    });
    if (!codeResponse.ok) throw new Error('WeChat code request failed');
    const contentType = codeResponse.headers.get('content-type')?.split(';')[0]?.trim();
    const image = Buffer.from(await codeResponse.arrayBuffer());
    const isPng =
      contentType === 'image/png' &&
      image.length >= 8 &&
      image.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    const isJpeg =
      contentType === 'image/jpeg' &&
      image.length >= 4 &&
      image.subarray(0, 3).toString('hex') === 'ffd8ff' &&
      image.subarray(-2).toString('hex') === 'ffd9';
    if (!isPng && !isJpeg) {
      throw new Error('WeChat code request failed');
    }
    return `data:${contentType};base64,${image.toString('base64')}`;
  } catch {
    throw new BusinessError('WECHAT_QR_CODE_FAILED', '小程序码生成失败，请稍后重试', 502);
  }
}

function invitationStatusError(invitation: {
  status: InvitationStatus;
  usedAt: Date | null;
  expiresAt: Date;
}): BusinessError | null {
  if (invitation.status === InvitationStatus.USED || invitation.usedAt) {
    return new BusinessError('INVITATION_ALREADY_USED', '邀请已经使用', 409);
  }
  if (invitation.status === InvitationStatus.REVOKED) {
    return new BusinessError('INVITATION_REVOKED', '邀请已经撤销', 410);
  }
  if (invitation.status === InvitationStatus.EXPIRED || invitation.expiresAt <= new Date()) {
    return new BusinessError('INVITATION_EXPIRED', '邀请已经过期', 410);
  }
  return null;
}

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
  constructor(
    private readonly database: PrismaClient = prisma,
    private readonly settings: AppConfig = config,
    private readonly exchangeCode: WechatCodeExchange = exchangeWechatCode,
    private readonly generateCode: WechatCodeGenerator = generateWechatMiniProgramCode,
  ) {}

  async login(account: string, passwordPlain: string) {
    const user = await this.database.user.findUnique({ where: { account } });
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

    return this.database.$transaction(async (tx) => {
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
    await this.database.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    realtimeService.disconnectSession(sessionId);
  }

  async getInvitationPreview(token: string) {
    const invitation = await this.database.teacherInvitation.findUnique({
      where: { tokenHash: opaqueTokenHash(token) },
      include: {
        classTeacher: {
          include: { classroom: true, teacher: true },
        },
      },
    });

    if (!invitation) {
      throw new BusinessError('INVITATION_NOT_FOUND', '邀请不存在', 404);
    }
    if (invitation.purpose !== TeacherInvitationPurpose.WEB_ACTIVATION) {
      throw new BusinessError('INVITATION_NOT_FOUND', '邀请不存在', 404);
    }
    const invitationError = invitationStatusError(invitation);
    if (invitationError) throw invitationError;
    if (
      invitation.classTeacher.status !== RelationStatus.ACTIVE ||
      invitation.classTeacher.teacher.status !== UserStatus.ACTIVE
    ) {
      throw new BusinessError('INVITATION_REVOKED', '教师关系已经失效', 410);
    }

    const headTeacher = await this.database.classTeacher.findFirst({
      where: {
        classId: invitation.classTeacher.classId,
        role: TeacherRole.HEAD_TEACHER,
        status: RelationStatus.ACTIVE,
        teacher: { status: UserStatus.ACTIVE },
      },
      select: { teacher: { select: { id: true, name: true } } },
    });
    if (!headTeacher) {
      throw new BusinessError('INVITATION_REVOKED', '班主任关系已经失效', 410);
    }

    return {
      classroom: {
        id: invitation.classTeacher.classroom.id,
        name: invitation.classTeacher.classroom.name,
      },
      headTeacher: headTeacher.teacher,
    };
  }

  async consumeInvitation(token: string, deviceName?: string) {
    void deviceName;
    const tokenHash = opaqueTokenHash(token);
    const invitation = await this.database.teacherInvitation.findUnique({
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
    if (invitation.purpose !== TeacherInvitationPurpose.WEB_ACTIVATION) {
      throw new BusinessError('INVITATION_NOT_FOUND', '邀请不存在', 404);
    }
    const invitationError = invitationStatusError(invitation);
    if (invitationError) {
      if (invitationError.code === 'INVITATION_EXPIRED') {
        await this.database.teacherInvitation.updateMany({
          where: { id: invitation.id, status: InvitationStatus.PENDING },
          data: { status: InvitationStatus.EXPIRED },
        });
      }
      throw invitationError;
    }
    if (
      invitation.classTeacher.status !== RelationStatus.ACTIVE ||
      invitation.classTeacher.teacher.status !== UserStatus.ACTIVE
    ) {
      throw new BusinessError('INVITATION_REVOKED', '教师关系已经失效', 410);
    }

    const consumedAt = new Date();
    const result = await this.database.$transaction(async (tx) => {
      const consumed = await tx.teacherInvitation.updateMany({
        where: {
          id: invitation.id,
          tokenHash,
          purpose: TeacherInvitationPurpose.WEB_ACTIVATION,
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

  async wechatLogin(code: string) {
    this.assertWechatEnabled();
    const identity = await this.exchangeCode(code, this.settings);
    const existing = await this.database.wechatTeacherIdentity.findUnique({
      where: { appId_openId: identity },
      include: {
        user: {
          include: {
            classLinks: {
              where: { status: RelationStatus.ACTIVE },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    if (existing) {
      if (existing.user.status !== UserStatus.ACTIVE || existing.user.classLinks.length === 0) {
        throw new BusinessError('TEACHER_ACCESS_REVOKED', '教师账号或任课关系已经失效', 403);
      }
      const tokens = await this.createSession(existing.userId, SessionClientType.TEACHER_MOBILE);
      return {
        status: 'BOUND' as const,
        ...tokens,
        teacher: { id: existing.user.id, name: existing.user.name },
      };
    }

    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.settings.wechatBindingTicketExpiresInSeconds * 1000,
    );
    await this.database.wechatBindingTicket.create({
      data: {
        ticketHash: opaqueTokenHash(ticket),
        appId: identity.appId,
        openId: identity.openId,
        expiresAt,
      },
    });
    return { status: 'UNBOUND' as const, ticket, expiresAt: expiresAt.toISOString() };
  }

  async generateWechatInvitationCode(scene: string): Promise<string> {
    this.assertWechatEnabled();
    return this.generateCode(scene, this.settings);
  }

  async getWechatInvitationPreview(token: string) {
    const invitation = await this.database.teacherInvitation.findUnique({
      where: { tokenHash: opaqueTokenHash(token) },
      include: { classTeacher: { include: { classroom: true, teacher: true } } },
    });
    if (!invitation || invitation.purpose !== TeacherInvitationPurpose.WECHAT_BINDING) {
      throw new BusinessError('INVITATION_NOT_FOUND', '邀请不存在', 404);
    }
    const invitationError = invitationStatusError(invitation);
    if (invitationError) throw invitationError;
    if (
      invitation.classTeacher.status !== RelationStatus.ACTIVE ||
      invitation.classTeacher.teacher.status !== UserStatus.ACTIVE
    ) {
      throw new BusinessError('INVITATION_REVOKED', '教师关系已经失效', 410);
    }

    const headTeacher = await this.database.classTeacher.findFirst({
      where: {
        classId: invitation.classTeacher.classId,
        role: TeacherRole.HEAD_TEACHER,
        status: RelationStatus.ACTIVE,
        teacher: { status: UserStatus.ACTIVE },
      },
      select: { teacher: { select: { id: true, name: true } } },
    });
    if (!headTeacher) {
      throw new BusinessError('INVITATION_REVOKED', '班主任关系已经失效', 410);
    }

    return {
      teacher: {
        id: invitation.classTeacher.teacher.id,
        name: invitation.classTeacher.teacher.name,
        subject: invitation.classTeacher.subject,
      },
      classroom: {
        id: invitation.classTeacher.classroom.id,
        name: invitation.classTeacher.classroom.name,
      },
      headTeacher: headTeacher.teacher,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async bindWechatIdentity(ticket: string, invitationToken: string) {
    this.assertWechatEnabled();
    const ticketHash = opaqueTokenHash(ticket);
    const bindingTicket = await this.database.wechatBindingTicket.findUnique({
      where: { ticketHash },
    });
    if (!bindingTicket || bindingTicket.appId !== this.settings.wechatAppId) {
      throw new BusinessError('WECHAT_TICKET_INVALID', '微信登录状态已失效，请重新登录', 401);
    }
    if (bindingTicket.consumedAt) {
      throw new BusinessError('WECHAT_TICKET_REPLAYED', '微信绑定凭证已经使用，请重新登录', 409);
    }
    if (bindingTicket.expiresAt <= new Date()) {
      throw new BusinessError('WECHAT_TICKET_EXPIRED', '微信登录状态已过期，请重新登录', 410);
    }

    const tokenHash = opaqueTokenHash(invitationToken);
    const invitation = await this.database.teacherInvitation.findUnique({
      where: { tokenHash },
      include: { classTeacher: { include: { classroom: true, teacher: true } } },
    });
    if (!invitation || invitation.purpose !== TeacherInvitationPurpose.WECHAT_BINDING) {
      throw new BusinessError('INVITATION_NOT_FOUND', '绑定邀请不存在', 404);
    }
    if (
      invitation.classTeacher.status !== RelationStatus.ACTIVE ||
      invitation.classTeacher.teacher.status !== UserStatus.ACTIVE
    ) {
      throw new BusinessError('INVITATION_REVOKED', '教师关系已经失效', 410);
    }

    const sameIdentity = await this.database.wechatTeacherIdentity.findUnique({
      where: {
        appId_openId: { appId: bindingTicket.appId, openId: bindingTicket.openId },
      },
    });
    if (sameIdentity) {
      if (sameIdentity.userId !== invitation.classTeacher.teacherId) {
        throw new BusinessError(
          'WECHAT_IDENTITY_CONFLICT',
          '此微信已绑定其他教师账号，请联系班主任核验',
          409,
        );
      }
      const statusError = invitationStatusError(invitation);
      if (statusError && statusError.code !== 'INVITATION_ALREADY_USED') throw statusError;
      return this.completeAlreadyBoundWechatTicket(
        bindingTicket.id,
        sameIdentity.userId,
        invitation,
        statusError?.code === 'INVITATION_ALREADY_USED',
        { appId: bindingTicket.appId, openId: bindingTicket.openId },
      );
    }

    const accountIdentity = await this.database.wechatTeacherIdentity.findUnique({
      where: {
        appId_userId: {
          appId: bindingTicket.appId,
          userId: invitation.classTeacher.teacherId,
        },
      },
    });
    if (accountIdentity) {
      throw new BusinessError(
        'TEACHER_WECHAT_CONFLICT',
        '教师账号已绑定其他微信，请联系班主任核验',
        409,
      );
    }

    const statusError = invitationStatusError(invitation);
    if (statusError) throw statusError;

    const now = new Date();
    try {
      const result = await this.database.$transaction(async (tx) => {
        const lockedRelation = await tx.classTeacher.updateMany({
          where: { id: invitation.classTeacherId, status: RelationStatus.ACTIVE },
          data: { updatedAt: now },
        });
        if (lockedRelation.count !== 1) {
          throw new BusinessError('INVITATION_REVOKED', '教师关系已经失效', 410);
        }
        const currentRelation = await tx.classTeacher.findUnique({
          where: { id: invitation.classTeacherId },
          include: { teacher: true },
        });
        if (
          !currentRelation ||
          currentRelation.status !== RelationStatus.ACTIVE ||
          currentRelation.teacher.status !== UserStatus.ACTIVE
        ) {
          throw new BusinessError('INVITATION_REVOKED', '教师关系已经失效', 410);
        }
        const activeHeadTeacher = await tx.classTeacher.findFirst({
          where: {
            classId: currentRelation.classId,
            role: TeacherRole.HEAD_TEACHER,
            status: RelationStatus.ACTIVE,
            teacher: { status: UserStatus.ACTIVE },
          },
          select: { id: true },
        });
        if (!activeHeadTeacher) {
          throw new BusinessError('INVITATION_REVOKED', '班主任关系已经失效', 410);
        }

        const claimedTicket = await tx.wechatBindingTicket.updateMany({
          where: { id: bindingTicket.id, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (claimedTicket.count !== 1) {
          throw new BusinessError(
            'WECHAT_TICKET_REPLAYED',
            '微信绑定凭证已经使用，请重新登录',
            409,
          );
        }

        const claimedInvitation = await tx.teacherInvitation.updateMany({
          where: {
            id: invitation.id,
            tokenHash,
            purpose: TeacherInvitationPurpose.WECHAT_BINDING,
            status: InvitationStatus.PENDING,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: { status: InvitationStatus.USED, usedAt: now },
        });
        if (claimedInvitation.count !== 1) {
          throw new BusinessError('INVITATION_ALREADY_USED', '邀请已经被消费', 409);
        }

        const identity = await tx.wechatTeacherIdentity.findUnique({
          where: {
            appId_openId: { appId: bindingTicket.appId, openId: bindingTicket.openId },
          },
        });
        const accountLink = await tx.wechatTeacherIdentity.findUnique({
          where: {
            appId_userId: {
              appId: bindingTicket.appId,
              userId: invitation.classTeacher.teacherId,
            },
          },
        });
        if (identity || accountLink) {
          throw new BusinessError(
            'WECHAT_IDENTITY_CONFLICT',
            '微信或教师账号已完成其他绑定，请重新登录并核验',
            409,
          );
        }

        await tx.wechatTeacherIdentity.create({
          data: {
            appId: bindingTicket.appId,
            openId: bindingTicket.openId,
            userId: invitation.classTeacher.teacherId,
          },
        });
        const tokens = await this.createSessionInTransaction(
          tx,
          invitation.classTeacher.teacherId,
          SessionClientType.TEACHER_MOBILE,
        );
        return tokens;
      });

      return {
        status: 'BOUND' as const,
        ...result,
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BusinessError(
          'WECHAT_IDENTITY_CONFLICT',
          '微信或教师账号已完成其他绑定，请重新登录并核验',
          409,
        );
      }
      throw error;
    }
  }

  private async completeAlreadyBoundWechatTicket(
    ticketId: string,
    userId: string,
    invitation: Prisma.TeacherInvitationGetPayload<{
      include: { classTeacher: { include: { classroom: true; teacher: true } } };
    }>,
    allowUsedInvitation: boolean,
    identityKey: WechatIdentity,
  ) {
    const now = new Date();
    const tokens = await this.database.$transaction(async (tx) => {
      const lockedRelation = await tx.classTeacher.updateMany({
        where: {
          id: invitation.classTeacherId,
          status: RelationStatus.ACTIVE,
        },
        data: { updatedAt: now },
      });
      if (lockedRelation.count !== 1) {
        throw new BusinessError('TEACHER_ACCESS_REVOKED', '教师账号或任课关系已经失效', 403);
      }
      const relation = await tx.classTeacher.findUnique({
        where: { id: invitation.classTeacherId },
        include: { teacher: true },
      });
      if (
        !relation ||
        relation.status !== RelationStatus.ACTIVE ||
        relation.teacher.status !== UserStatus.ACTIVE ||
        relation.teacherId !== userId
      ) {
        throw new BusinessError('TEACHER_ACCESS_REVOKED', '教师账号或任课关系已经失效', 403);
      }
      const activeHeadTeacher = await tx.classTeacher.findFirst({
        where: {
          classId: relation.classId,
          role: TeacherRole.HEAD_TEACHER,
          status: RelationStatus.ACTIVE,
          teacher: { status: UserStatus.ACTIVE },
        },
        select: { id: true },
      });
      if (!activeHeadTeacher) {
        throw new BusinessError('INVITATION_REVOKED', '班主任关系已经失效', 410);
      }
      const currentInvitation = await tx.teacherInvitation.findUnique({
        where: { id: invitation.id },
      });
      if (
        !currentInvitation ||
        currentInvitation.purpose !== TeacherInvitationPurpose.WECHAT_BINDING
      ) {
        throw new BusinessError('INVITATION_NOT_FOUND', '绑定邀请不存在', 404);
      }
      if (allowUsedInvitation) {
        if (currentInvitation.status !== InvitationStatus.USED || !currentInvitation.usedAt) {
          throw new BusinessError('INVITATION_ALREADY_USED', '邀请状态已经变化，请重新登录', 409);
        }
      } else {
        const claimedInvitation = await tx.teacherInvitation.updateMany({
          where: {
            id: invitation.id,
            purpose: TeacherInvitationPurpose.WECHAT_BINDING,
            status: InvitationStatus.PENDING,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: { status: InvitationStatus.USED, usedAt: now },
        });
        if (claimedInvitation.count !== 1) {
          throw new BusinessError('INVITATION_ALREADY_USED', '邀请已经被消费', 409);
        }
      }
      const claimed = await tx.wechatBindingTicket.updateMany({
        where: { id: ticketId, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1) {
        throw new BusinessError('WECHAT_TICKET_REPLAYED', '微信绑定凭证已经使用，请重新登录', 409);
      }
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new BusinessError('TEACHER_ACCESS_REVOKED', '教师账号或任课关系已经失效', 403);
      }
      const identity = await tx.wechatTeacherIdentity.findUnique({
        where: {
          appId_openId: identityKey,
        },
      });
      if (!identity || identity.userId !== userId) {
        throw new BusinessError(
          'WECHAT_IDENTITY_CONFLICT',
          '微信绑定状态已经变化，请重新登录',
          409,
        );
      }
      return this.createSessionInTransaction(tx, userId, SessionClientType.TEACHER_MOBILE);
    });
    return {
      status: 'BOUND' as const,
      ...tokens,
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

  private assertWechatEnabled(): void {
    if (!this.settings.wechatEnabled) {
      throw new BusinessError('WECHAT_LOGIN_DISABLED', '微信登录尚未启用', 503);
    }
    if (!this.settings.wechatAppId || !this.settings.wechatAppSecret) {
      throw new BusinessError('WECHAT_NOT_CONFIGURED', '微信登录尚未配置', 503);
    }
  }

  private async createSession(userId: string, clientType: SessionClientType): Promise<TokenPair> {
    return this.database.$transaction((tx) =>
      this.createSessionInTransaction(tx, userId, clientType),
    );
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

    const accessToken = jwt.sign(accessClaims, this.settings.jwtAccessSecret, {
      expiresIn: parseDuration(this.settings.jwtAccessExpiresIn),
    });
    const refreshToken = jwt.sign(refreshClaims, this.settings.jwtRefreshSecret, {
      expiresIn: parseDuration('180d'),
    });

    return { accessToken, refreshToken };
  }

  private verifyRefreshToken(token: string): RefreshClaims {
    try {
      const claims = jwt.verify(token, this.settings.jwtRefreshSecret) as RefreshClaims;
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
