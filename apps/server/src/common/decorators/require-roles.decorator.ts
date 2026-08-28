import { SetMetadata } from '@nestjs/common';
import type { TeacherRole } from '@prisma/client';
import { REQUIRED_ROLES_METADATA } from '../auth/auth.constants';

export const RequireRoles = (...roles: TeacherRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES_METADATA, roles);
