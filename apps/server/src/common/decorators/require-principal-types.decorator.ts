import { SetMetadata } from '@nestjs/common';
import { REQUIRED_PRINCIPAL_TYPES_METADATA } from '../auth/auth.constants';
import type { PrincipalType } from '../auth/jwt-principal';

export const RequirePrincipalTypes = (
  ...types: PrincipalType[]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_PRINCIPAL_TYPES_METADATA, types);
