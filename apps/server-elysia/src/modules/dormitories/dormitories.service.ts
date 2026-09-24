import { randomUUID } from 'node:crypto';
import { Prisma, RelationStatus, ScoreEventType, StudentStatus, TeacherRole } from '@prisma/client';
import { prisma } from '../../plugins/prisma';
import { BusinessError } from '../../plugins/error-handler';
import { ClassEventType } from '../realtime/realtime.types';
import { realtimeService } from '../realtime/realtime.service';
import { scoreEventsService } from '../scores/score-events.service';

const dormitoryInclude = {
  students: {
    where: { status: StudentStatus.ACTIVE, deletedAt: null },
    select: { id: true, name: true, studentNo: true },
    orderBy: [{ studentNo: 'asc' }, { name: 'asc' }],
  },
} satisfies Prisma.DormitoryInclude;

function normalizeName(name: string): string {
  const value = name.trim();
  if (!value) throw new BusinessError('INVALID_DORMITORY_NAME', '请输入寝室名称');
  return value;
}

function duplicateName(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    throw new BusinessError('DORMITORY_NAME_EXISTS', '本班已有同名寝室', 409);
  throw error;
}

export class DormitoriesService {
  constructor(
    private readonly db = prisma,
    private readonly scoreEvents = scoreEventsService,
    private readonly realtime = realtimeService,
  ) {}

  private async assertAccess(classId: string, operatorId: string, headOnly = false) {
    const access = await this.db.classTeacher.findFirst({
      where: {
        classId,
        teacherId: operatorId,
        status: RelationStatus.ACTIVE,
        role: headOnly
          ? TeacherRole.HEAD_TEACHER
          : { in: [TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER] },
      },
      select: { teacherId: true },
    });
    if (!access) throw new BusinessError('FORBIDDEN_CLASS_ACCESS', '无权访问该班级', 403);
  }

  async list(classId: string, operatorId: string) {
    await this.assertAccess(classId, operatorId);
    return this.db.dormitory.findMany({
      where: { classId },
      include: dormitoryInclude,
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(classId: string, operatorId: string, name: string) {
    await this.assertAccess(classId, operatorId, true);
    try {
      return await this.db.dormitory.create({
        data: { classId, name: normalizeName(name) },
        include: dormitoryInclude,
      });
    } catch (error) {
      duplicateName(error);
    }
  }

  async rename(classId: string, dormitoryId: string, operatorId: string, name: string) {
    await this.assertAccess(classId, operatorId, true);
    const normalized = normalizeName(name);
    try {
      return await this.db.$transaction(async (tx) => {
        const dormitory = await tx.dormitory.findFirst({ where: { id: dormitoryId, classId } });
        if (!dormitory) throw new BusinessError('DORMITORY_NOT_FOUND', '寝室不存在', 404);
        return tx.dormitory.update({
          where: { id: dormitoryId },
          data: { name: normalized },
          include: dormitoryInclude,
        });
      });
    } catch (error) {
      duplicateName(error);
    }
  }

  async remove(classId: string, dormitoryId: string, operatorId: string) {
    await this.assertAccess(classId, operatorId, true);
    const affectedIds = await this.db.$transaction(async (tx) => {
      const dormitory = await tx.dormitory.findFirst({ where: { id: dormitoryId, classId } });
      if (!dormitory) throw new BusinessError('DORMITORY_NOT_FOUND', '寝室不存在', 404);
      const members = await tx.student.findMany({
        where: { classId, dormitoryId },
        select: { id: true },
      });
      await tx.student.updateMany({ where: { classId, dormitoryId }, data: { dormitoryId: null } });
      await tx.dormitory.delete({ where: { id: dormitoryId } });
      return members.map((member) => member.id);
    });
    this.notifyMembersChanged(classId, affectedIds);
    return { id: dormitoryId, removedStudentIds: affectedIds };
  }

  async addMembers(classId: string, dormitoryId: string, operatorId: string, studentIds: string[]) {
    await this.assertAccess(classId, operatorId, true);
    if (studentIds.length === 0 || new Set(studentIds).size !== studentIds.length)
      throw new BusinessError('INVALID_DORMITORY_MEMBERS', '请选择不重复的学生');
    const result = await this.db.$transaction(async (tx) => {
      const dormitory = await tx.dormitory.findFirst({ where: { id: dormitoryId, classId } });
      if (!dormitory) throw new BusinessError('DORMITORY_NOT_FOUND', '寝室不存在', 404);
      const students = await tx.student.findMany({
        where: {
          classId,
          id: { in: studentIds },
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (students.length !== studentIds.length)
        throw new BusinessError('STUDENT_NOT_FOUND', '只能分配本班在班学生', 404);
      const changed = await tx.student.updateMany({
        where: { classId, id: { in: studentIds }, status: StudentStatus.ACTIVE, deletedAt: null },
        data: { dormitoryId },
      });
      if (changed.count !== studentIds.length)
        throw new BusinessError('STUDENT_NOT_FOUND', '只能分配本班在班学生', 404);
      return tx.dormitory.findUniqueOrThrow({
        where: { id: dormitoryId },
        include: dormitoryInclude,
      });
    });
    this.notifyMembersChanged(classId, studentIds);
    return result;
  }

  async removeMember(classId: string, dormitoryId: string, operatorId: string, studentId: string) {
    await this.assertAccess(classId, operatorId, true);
    const result = await this.db.$transaction(async (tx) => {
      const dormitory = await tx.dormitory.findFirst({ where: { id: dormitoryId, classId } });
      if (!dormitory) throw new BusinessError('DORMITORY_NOT_FOUND', '寝室不存在', 404);
      const changed = await tx.student.updateMany({
        where: { id: studentId, classId, dormitoryId },
        data: { dormitoryId: null },
      });
      if (changed.count !== 1)
        throw new BusinessError('DORMITORY_MEMBER_MISMATCH', '学生已不属于该寝室，请刷新名单', 409);
      return tx.dormitory.findUniqueOrThrow({
        where: { id: dormitoryId },
        include: dormitoryInclude,
      });
    });
    this.notifyMembersChanged(classId, [studentId]);
    return result;
  }

  async score(
    classId: string,
    dormitoryId: string,
    operatorId: string,
    input: { studentIds: string[]; delta: number; reason: string; businessKey: string },
  ) {
    return this.scoreEvents.create(classId, operatorId, {
      type: ScoreEventType.DORM_HYGIENE,
      studentIds: input.studentIds,
      manualDelta: input.delta,
      reason: input.reason,
      businessKey: input.businessKey,
      dormitoryId,
    });
  }

  private notifyMembersChanged(classId: string, studentIds: string[]): void {
    this.realtime.publishClassEvent(classId, {
      id: randomUUID(),
      type: ClassEventType.STUDENT_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: { studentIds },
    });
  }
}

export const dormitoriesService = new DormitoriesService();
