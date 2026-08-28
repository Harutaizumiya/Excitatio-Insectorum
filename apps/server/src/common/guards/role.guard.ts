import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TeacherRole } from '@prisma/client';
import { REQUIRED_ROLES_METADATA } from '../auth/auth.constants';
import { BusinessException } from '../exceptions/business.exception';
import type { RequestContext } from '../interfaces/request-context';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<TeacherRole[]>(REQUIRED_ROLES_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const access = context.switchToHttp().getRequest<RequestContext>().classAccess;
    if (!access || !requiredRoles.includes(access.role)) {
      throw new BusinessException(
        'FORBIDDEN_ROLE',
        '当前班级角色无权执行此操作',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
