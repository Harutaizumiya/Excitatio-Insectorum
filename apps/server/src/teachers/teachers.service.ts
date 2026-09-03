import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvitationStatus, RelationStatus, TeacherRole, UserStatus } from '@prisma/client';
import { PasswordHasherService } from '../auth';
import { BusinessException } from '../common';
import { ClassroomsService } from '../classrooms';
import { PrismaService } from '../prisma';
import { RealtimeService } from '../realtime';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';

function invitationHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classrooms: ClassroomsService,
    private readonly passwords: PasswordHasherService,
    private readonly config: ConfigService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  async list(userId: string, classId: string) {
    await this.classrooms.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    return this.prisma.classTeacher.findMany({
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
  }

  async create(userId: string, classId: string, dto: CreateTeacherDto) {
    await this.classrooms.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    const generatedPasswordHash = await this.passwords.hash(randomBytes(32).toString('base64url'));
    const account = `invited-${randomUUID()}`;
    return this.prisma.$transaction(async (transaction) => {
      const teacher = await transaction.user.create({
        data: {
          name: dto.name,
          account,
          passwordHash: generatedPasswordHash,
          status: UserStatus.ACTIVE,
        },
      });
      const relation = await transaction.classTeacher.create({
        data: {
          classId,
          teacherId: teacher.id,
          role: TeacherRole.SUBJECT_TEACHER,
          subject: dto.subject,
          status: RelationStatus.ACTIVE,
        },
      });
      return { classTeacherId: relation.id, teacherId: teacher.id };
    });
  }

  async update(userId: string, classId: string, classTeacherId: string, dto: UpdateTeacherDto) {
    await this.classrooms.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    const relation = await this.getSubjectRelation(classId, classTeacherId);
    await this.prisma.$transaction(async (transaction) => {
      if (dto.name !== undefined) {
        await transaction.user.update({
          where: { id: relation.teacherId },
          data: { name: dto.name },
        });
      }
      if (dto.subject !== undefined) {
        await transaction.classTeacher.update({
          where: { id: classTeacherId },
          data: { subject: dto.subject },
        });
      }
    });
    return this.getSubjectRelation(classId, classTeacherId);
  }

  async revoke(userId: string, classId: string, classTeacherId: string): Promise<void> {
    await this.classrooms.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    const relation = await this.getSubjectRelation(classId, classTeacherId);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.classTeacher.updateMany({
        where: {
          id: classTeacherId,
          classId,
          role: TeacherRole.SUBJECT_TEACHER,
          status: RelationStatus.ACTIVE,
        },
        data: { status: RelationStatus.REVOKED },
      });
      if (revoked.count !== 1) {
        throw new BusinessException(
          'TEACHER_RELATION_REVOKED',
          '任课教师关系已撤销',
          HttpStatus.CONFLICT,
        );
      }
      await transaction.teacherInvitation.updateMany({
        where: { classTeacherId, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.REVOKED },
      });
      await transaction.session.updateMany({
        where: { userId: relation.teacherId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
    this.realtime?.disconnectUser(relation.teacherId);
  }

  async remove(userId: string, classId: string, classTeacherId: string): Promise<void> {
    await this.classrooms.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    const teacherId = await this.prisma.$transaction(async (transaction) => {
      const relation = await transaction.classTeacher.findFirst({
        where: {
          id: classTeacherId,
          classId,
          role: TeacherRole.SUBJECT_TEACHER,
        },
        select: { teacherId: true },
      });
      if (!relation) {
        throw new BusinessException(
          'CLASS_TEACHER_NOT_FOUND',
          '任课教师关系不存在',
          HttpStatus.NOT_FOUND,
        );
      }

      await transaction.teacherInvitation.deleteMany({ where: { classTeacherId } });
      await transaction.scheduleEntry.updateMany({
        where: { classTeacherId },
        data: { classTeacherId: null },
      });
      await transaction.session.updateMany({
        where: { userId: relation.teacherId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const deleted = await transaction.classTeacher.deleteMany({
        where: {
          id: classTeacherId,
          classId,
          role: TeacherRole.SUBJECT_TEACHER,
        },
      });
      if (deleted.count !== 1) {
        throw new BusinessException(
          'CLASS_TEACHER_NOT_FOUND',
          '任课教师关系不存在',
          HttpStatus.NOT_FOUND,
        );
      }
      return relation.teacherId;
    });
    this.realtime?.disconnectUser(teacherId);
  }

  async restore(userId: string, classId: string, classTeacherId: string): Promise<void> {
    await this.classrooms.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    const relation = await this.prisma.classTeacher.findFirst({
      where: {
        id: classTeacherId,
        classId,
        role: TeacherRole.SUBJECT_TEACHER,
        status: RelationStatus.REVOKED,
      },
      select: { teacherId: true },
    });
    if (!relation) {
      throw new BusinessException(
        'CLASS_TEACHER_NOT_FOUND',
        '任课教师关系不存在或已启用',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.$transaction([
      this.prisma.classTeacher.update({
        where: { id: classTeacherId },
        data: { status: RelationStatus.ACTIVE },
      }),
      this.prisma.user.update({
        where: { id: relation.teacherId },
        data: { status: UserStatus.ACTIVE },
      }),
    ]);
  }

  async createInvitation(userId: string, classId: string, classTeacherId: string) {
    await this.classrooms.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    await this.getSubjectRelation(classId, classTeacherId);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.invitationTtlMilliseconds());
    await this.prisma.teacherInvitation.create({
      data: {
        classTeacherId,
        tokenHash: invitationHash(token),
        expiresAt,
        status: InvitationStatus.PENDING,
      },
    });
    return {
      inviteUrl: `/invite/${encodeURIComponent(token)}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async getSubjectRelation(classId: string, classTeacherId: string) {
    const relation = await this.prisma.classTeacher.findFirst({
      where: {
        id: classTeacherId,
        classId,
        role: TeacherRole.SUBJECT_TEACHER,
        status: RelationStatus.ACTIVE,
      },
      include: { teacher: { select: { id: true, name: true, status: true } } },
    });
    if (!relation) {
      throw new BusinessException(
        'CLASS_TEACHER_NOT_FOUND',
        '任课教师关系不存在',
        HttpStatus.NOT_FOUND,
      );
    }
    return relation;
  }

  private invitationTtlMilliseconds(): number {
    const value = this.config.getOrThrow<string>('jwt.invitationExpiresIn');
    const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
    if (!match) {
      throw new Error(`Invalid invitation expiry: ${value}`);
    }
    const amount = Number(match[1]);
    const multipliers = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 } as const;
    const multiplier = multipliers[match[2] as keyof typeof multipliers];
    return amount * multiplier;
  }
}
