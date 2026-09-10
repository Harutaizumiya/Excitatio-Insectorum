import { Elysia, t } from 'elysia';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import {
  InvitationStatus,
  Prisma,
  PrismaClient,
  RelationStatus,
  TeacherRole,
  UserStatus,
} from '@prisma/client';
import { prismaPlugin } from '../../plugins/prisma';
import { authPlugin } from '../../plugins/auth';
import { BusinessError } from '../../plugins/error-handler';
import { realtimeService } from '../realtime/realtime.service';

function invitationHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function assertHeadTeacher(prisma: PrismaClient, userId: string, classId: string) {
  const access = await prisma.classTeacher.findFirst({
    where: {
      teacherId: userId,
      classId,
      status: RelationStatus.ACTIVE,
      role: TeacherRole.HEAD_TEACHER,
    },
  });
  if (!access) {
    throw new BusinessError('FORBIDDEN_ROLE', '仅班主任有权进行此项操作', 403);
  }
  return access;
}

export const teachersController = new Elysia({ prefix: '/classes/:classId/teachers' })
  .use(prismaPlugin)
  .use(authPlugin)
  .get(
    '',
    async ({ prisma, user, params: { classId } }) => {
      await assertHeadTeacher(prisma, user!.sub, classId);
      const data = await prisma.classTeacher.findMany({
        where: { classId },
        include: {
          teacher: { select: { id: true, name: true, status: true } },
          invitations: {
            select: { status: true, expiresAt: true, usedAt: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      detail: { summary: '列出班级教师关系', tags: ['Teachers'] },
    },
  )
  .post(
    '',
    async ({ prisma, user, params: { classId }, body }) => {
      await assertHeadTeacher(prisma, user!.sub, classId);
      const generatedPasswordHash = await hash(randomBytes(32).toString('base64url'), 12);
      const account = `invited-${randomUUID()}`;

      const data = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const teacher = await tx.user.create({
          data: {
            name: body.name,
            account,
            passwordHash: generatedPasswordHash,
            status: UserStatus.ACTIVE,
          },
        });
        const relation = await tx.classTeacher.create({
          data: {
            classId,
            teacherId: teacher.id,
            role: TeacherRole.SUBJECT_TEACHER,
            subject: body.subject,
            status: RelationStatus.ACTIVE,
          },
        });
        return { classTeacherId: relation.id, teacherId: teacher.id };
      });

      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      body: t.Object({
        name: t.String(),
        subject: t.String(),
      }),
      detail: { summary: '创建任课教师', tags: ['Teachers'] },
    },
  )
  .patch(
    '/:classTeacherId',
    async ({ prisma, user, params: { classId, classTeacherId }, body }) => {
      await assertHeadTeacher(prisma, user!.sub, classId);
      const relation = await prisma.classTeacher.findFirst({
        where: {
          id: classTeacherId,
          classId,
          role: TeacherRole.SUBJECT_TEACHER,
          status: RelationStatus.ACTIVE,
        },
      });
      if (!relation) {
        throw new BusinessError('CLASS_TEACHER_NOT_FOUND', '任课教师关系不存在', 404);
      }

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (body.name !== undefined) {
          await tx.user.update({
            where: { id: relation.teacherId },
            data: { name: body.name },
          });
        }
        if (body.subject !== undefined) {
          await tx.classTeacher.update({
            where: { id: classTeacherId },
            data: { subject: body.subject },
          });
        }
      });

      const updated = await prisma.classTeacher.findFirst({
        where: { id: classTeacherId },
        include: { teacher: { select: { id: true, name: true, status: true } } },
      });
      return { data: updated };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), classTeacherId: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        subject: t.Optional(t.String()),
      }),
      detail: { summary: '更新任课教师姓名或科目', tags: ['Teachers'] },
    },
  )
  .post(
    '/:classTeacherId/revoke',
    async ({ prisma, user, params: { classId, classTeacherId } }) => {
      await assertHeadTeacher(prisma, user!.sub, classId);
      const relation = await prisma.classTeacher.findFirst({
        where: {
          id: classTeacherId,
          classId,
          role: TeacherRole.SUBJECT_TEACHER,
          status: RelationStatus.ACTIVE,
        },
      });
      if (!relation) {
        throw new BusinessError('CLASS_TEACHER_NOT_FOUND', '任课教师关系不存在', 404);
      }

      const now = new Date();
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.classTeacher.update({
          where: { id: classTeacherId },
          data: { status: RelationStatus.REVOKED },
        });
        await tx.teacherInvitation.updateMany({
          where: { classTeacherId, status: InvitationStatus.PENDING },
          data: { status: InvitationStatus.REVOKED },
        });
        await tx.session.updateMany({
          where: { userId: relation.teacherId, revokedAt: null },
          data: { revokedAt: now },
        });
      });

      realtimeService.disconnectUser(relation.teacherId);
      return { data: { revoked: true } };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), classTeacherId: t.String() }),
      detail: { summary: '撤销任课教师关系并吊销会话', tags: ['Teachers'] },
    },
  )
  .delete(
    '/:classTeacherId',
    async ({ prisma, user, params: { classId, classTeacherId } }) => {
      await assertHeadTeacher(prisma, user!.sub, classId);
      const relation = await prisma.classTeacher.findFirst({
        where: {
          id: classTeacherId,
          classId,
          role: TeacherRole.SUBJECT_TEACHER,
        },
      });
      if (!relation) {
        throw new BusinessError('CLASS_TEACHER_NOT_FOUND', '任课教师关系不存在', 404);
      }

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.teacherInvitation.deleteMany({ where: { classTeacherId } });
        await tx.scheduleEntry.updateMany({
          where: { classTeacherId },
          data: { classTeacherId: null },
        });
        await tx.session.updateMany({
          where: { userId: relation.teacherId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.classTeacher.delete({ where: { id: classTeacherId } });
      });

      realtimeService.disconnectUser(relation.teacherId);
      return { data: { deleted: true } };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), classTeacherId: t.String() }),
      detail: { summary: '删除任课教师关系', tags: ['Teachers'] },
    },
  )
  .post(
    '/:classTeacherId/restore',
    async ({ prisma, user, params: { classId, classTeacherId } }) => {
      await assertHeadTeacher(prisma, user!.sub, classId);
      const relation = await prisma.classTeacher.findFirst({
        where: {
          id: classTeacherId,
          classId,
          role: TeacherRole.SUBJECT_TEACHER,
          status: RelationStatus.REVOKED,
        },
      });
      if (!relation) {
        throw new BusinessError('CLASS_TEACHER_NOT_FOUND', '任课教师关系不存在或已启用', 404);
      }

      await prisma.$transaction([
        prisma.classTeacher.update({
          where: { id: classTeacherId },
          data: { status: RelationStatus.ACTIVE },
        }),
        prisma.user.update({
          where: { id: relation.teacherId },
          data: { status: UserStatus.ACTIVE },
        }),
      ]);

      return { data: { restored: true } };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), classTeacherId: t.String() }),
      detail: { summary: '恢复已撤销任课教师关系', tags: ['Teachers'] },
    },
  )
  .post(
    '/:classTeacherId/invitations',
    async ({ prisma, user, params: { classId, classTeacherId } }) => {
      await assertHeadTeacher(prisma, user!.sub, classId);
      const relation = await prisma.classTeacher.findFirst({
        where: {
          id: classTeacherId,
          classId,
          role: TeacherRole.SUBJECT_TEACHER,
          status: RelationStatus.ACTIVE,
        },
      });
      if (!relation) {
        throw new BusinessError('CLASS_TEACHER_NOT_FOUND', '任课教师关系不存在', 404);
      }

      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      await prisma.teacherInvitation.create({
        data: {
          classTeacherId,
          tokenHash: invitationHash(token),
          expiresAt,
          status: InvitationStatus.PENDING,
        },
      });

      return {
        data: {
          inviteUrl: `/invite/${encodeURIComponent(token)}`,
          expiresAt: expiresAt.toISOString(),
        },
      };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), classTeacherId: t.String() }),
      detail: { summary: '生成一次性教师邀请', tags: ['Teachers'] },
    },
  );
