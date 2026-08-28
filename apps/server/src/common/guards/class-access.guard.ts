import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RelationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { CLASS_SCOPE_METADATA } from '../auth/auth.constants';
import { isUserPrincipal } from '../auth/jwt-principal';
import { BusinessException } from '../exceptions/business.exception';
import type { RequestContext } from '../interfaces/request-context';

@Injectable()
export class ClassAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const routeParameter = this.reflector.getAllAndOverride<string>(CLASS_SCOPE_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!routeParameter) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    const routeValue = request.params?.[routeParameter];
    const classId = Array.isArray(routeValue) ? routeValue[0] : routeValue;
    if (!classId) {
      throw new BusinessException(
        'CLASS_SCOPE_MISSING',
        `缺少班级作用域参数 ${routeParameter}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!request.user || !isUserPrincipal(request.user)) {
      throw new BusinessException(
        'FORBIDDEN_CLASS_ACCESS',
        '当前身份无权访问班级',
        HttpStatus.FORBIDDEN,
      );
    }

    const classAccess = await this.prisma.classTeacher.findFirst({
      where: {
        classId,
        teacherId: request.user.sub,
        status: RelationStatus.ACTIVE,
      },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        role: true,
        subject: true,
      },
    });

    if (!classAccess) {
      throw new BusinessException('FORBIDDEN_CLASS_ACCESS', '无权访问该班级', HttpStatus.FORBIDDEN);
    }

    request.classAccess = {
      classTeacherId: classAccess.id,
      classId: classAccess.classId,
      teacherId: classAccess.teacherId,
      role: classAccess.role,
      subject: classAccess.subject,
    };

    return true;
  }
}
