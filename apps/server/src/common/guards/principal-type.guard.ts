import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PRINCIPAL_TYPES_METADATA } from '../auth/auth.constants';
import type { PrincipalType } from '../auth/jwt-principal';
import { BusinessException } from '../exceptions/business.exception';
import type { RequestContext } from '../interfaces/request-context';

@Injectable()
export class PrincipalTypeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredTypes = this.reflector.getAllAndOverride<PrincipalType[]>(
      REQUIRED_PRINCIPAL_TYPES_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredTypes?.length) {
      return true;
    }

    const principal = context.switchToHttp().getRequest<RequestContext>().user;
    if (!principal || !requiredTypes.includes(principal.type)) {
      throw new BusinessException(
        'FORBIDDEN_PRINCIPAL_TYPE',
        '当前身份无权访问',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
