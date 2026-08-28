import { SetMetadata } from '@nestjs/common';
import { CLASS_SCOPE_METADATA } from '../auth/auth.constants';

export const ClassScope = (routeParameter = 'classId'): MethodDecorator & ClassDecorator =>
  SetMetadata(CLASS_SCOPE_METADATA, routeParameter);
