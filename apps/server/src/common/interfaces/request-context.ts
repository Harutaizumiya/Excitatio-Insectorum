import type { TeacherRole } from '@prisma/client';
import type { Request } from 'express';
import type { JwtPrincipal } from '../auth/jwt-principal';

export interface ClassAccessContext {
  classTeacherId: string;
  classId: string;
  teacherId: string;
  role: TeacherRole;
  subject: string | null;
}

export interface RequestContext extends Request {
  requestId?: string;
  user?: JwtPrincipal;
  classAccess?: ClassAccessContext;
}
