import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { DeviceStatus, UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { BusinessException, JWT_STRATEGY, PrincipalType, type AccessTokenClaims } from '../common';
import { PrismaService } from '../prisma';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  async validate(claims: AccessTokenClaims): Promise<AccessTokenClaims> {
    if (claims.type === PrincipalType.DISPLAY_DEVICE) {
      const device = await this.prisma.displayDevice.findFirst({
        where: { id: claims.sub, classId: claims.classId, status: DeviceStatus.ACTIVE },
        select: { id: true },
      });
      if (!device) {
        throw new BusinessException(
          'DEVICE_ACCESS_REVOKED',
          '大屏设备凭证已经失效',
          HttpStatus.UNAUTHORIZED,
        );
      }
      return claims;
    }
    if (claims.type !== PrincipalType.USER || !claims.sessionId) {
      throw new BusinessException('INVALID_ACCESS_TOKEN', '访问令牌无效', HttpStatus.UNAUTHORIZED);
    }
    const session = await this.prisma.session.findUnique({
      where: { id: claims.sessionId },
      include: { user: { select: { status: true } } },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.user.status !== UserStatus.ACTIVE ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new BusinessException('SESSION_REVOKED', '登录会话已经失效', HttpStatus.UNAUTHORIZED);
    }
    return claims;
  }
}
