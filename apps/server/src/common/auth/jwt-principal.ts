export enum PrincipalType {
  USER = 'USER',
  DISPLAY_DEVICE = 'DISPLAY_DEVICE',
}

interface BaseAccessTokenClaims {
  sub: string;
  type: PrincipalType;
  iat?: number;
  exp?: number;
}

export interface UserAccessTokenClaims extends BaseAccessTokenClaims {
  type: PrincipalType.USER;
  sessionId: string;
}

export interface DisplayAccessTokenClaims extends BaseAccessTokenClaims {
  type: PrincipalType.DISPLAY_DEVICE;
  classId: string;
}

export type AccessTokenClaims = UserAccessTokenClaims | DisplayAccessTokenClaims;
export type JwtPrincipal = AccessTokenClaims;

export function isUserPrincipal(principal: JwtPrincipal): principal is UserAccessTokenClaims {
  return principal.type === PrincipalType.USER;
}

export function isDisplayPrincipal(principal: JwtPrincipal): principal is DisplayAccessTokenClaims {
  return principal.type === PrincipalType.DISPLAY_DEVICE;
}
