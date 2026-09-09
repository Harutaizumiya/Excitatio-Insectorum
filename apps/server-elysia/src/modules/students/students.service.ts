import { type Prisma, StudentGender, StudentStatus, TeacherRole } from '@prisma/client';
import { prisma } from '../../plugins/prisma';
import { BusinessError } from '../../plugins/error-handler';
import { ClassEventType } from '../realtime/realtime.types';
import { realtimeService } from '../realtime/realtime.service';

export interface ListStudentsQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: StudentStatus;
  includeDeleted?: boolean;
}

export class StudentsService {
  async assertAccess(userId: string, classId: string, roles?: TeacherRole[]) {
    const access = await prisma.classTeacher.findFirst({
      where: {
        teacherId: userId,
        classId,
        status: 'ACTIVE',
        ...(roles?.length ? { role: { in: roles } } : {}),
      },
    });
    if (!access) {
      throw new BusinessError('FORBIDDEN_CLASS_ACCESS', '无权访问该班级', 403);
    }
    return access;
  }

  async list(userId: string, classId: string, query: ListStudentsQuery) {
    const access = await this.assertAccess(userId, classId);
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const includeDeleted = Boolean(query.includeDeleted && access.role === TeacherRole.HEAD_TEACHER);

    const where: Prisma.StudentWhereInput = {
      classId,
      ...(!includeDeleted ? { deletedAt: null } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword } },
              { studentNo: { contains: query.keyword } },
            ],
          }
        : {}),
    };

    const [students, total] = await prisma.$transaction([
      prisma.student.findMany({
        where,
        orderBy: [{ studentNo: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.student.count({ where }),
    ]);

    return { students, meta: { page, pageSize, total } };
  }

  async create(
    userId: string,
    classId: string,
    dto: { name: string; studentNo?: string; gender?: StudentGender },
  ) {
    await this.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);

    if (dto.studentNo) {
      const existing = await prisma.student.findFirst({
        where: { classId, studentNo: dto.studentNo, deletedAt: null },
      });
      if (existing) {
        throw new BusinessError('STUDENT_NO_CONFLICT', '学号已被使用', 409);
      }
    }

    const student = await prisma.student.create({
      data: {
        classId,
        name: dto.name,
        studentNo: dto.studentNo || null,
        gender: dto.gender ?? StudentGender.UNKNOWN,
      },
    });

    realtimeService.publishClassEvent(classId, {
      id: `${classId}-${student.id}-${Date.now()}`,
      type: ClassEventType.STUDENT_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: { studentId: student.id, action: 'CREATED' },
    });

    return student;
  }

  async update(
    userId: string,
    classId: string,
    studentId: string,
    dto: { name?: string; studentNo?: string; gender?: StudentGender },
  ) {
    await this.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);

    const student = await prisma.student.findFirst({
      where: { id: studentId, classId, deletedAt: null },
    });
    if (!student) {
      throw new BusinessError('STUDENT_NOT_FOUND', '学生不存在', 404);
    }

    if (dto.studentNo && dto.studentNo !== student.studentNo) {
      const conflict = await prisma.student.findFirst({
        where: {
          classId,
          studentNo: dto.studentNo,
          deletedAt: null,
          id: { not: studentId },
        },
      });
      if (conflict) {
        throw new BusinessError('STUDENT_NO_CONFLICT', '学号已被使用', 409);
      }
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: {
        name: dto.name,
        studentNo: dto.studentNo !== undefined ? dto.studentNo || null : undefined,
        gender: dto.gender,
      },
    });

    realtimeService.publishClassEvent(classId, {
      id: `${classId}-${studentId}-${Date.now()}`,
      type: ClassEventType.STUDENT_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: { studentId, action: 'UPDATED' },
    });

    return updated;
  }

  async deactivate(userId: string, classId: string, studentId: string) {
    return this.changeStudentLifecycle(userId, classId, studentId, {
      action: 'DEACTIVATED',
      deletedAt: null,
      allowInactive: false,
    });
  }

  async restore(userId: string, classId: string, studentId: string) {
    await this.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    const current = await prisma.student.findFirst({ where: { id: studentId, classId } });
    if (!current) {
      throw new BusinessError('STUDENT_NOT_FOUND', '学生不存在', 404);
    }
    if (!current.deletedAt && current.status === StudentStatus.ACTIVE) {
      throw new BusinessError('STUDENT_ALREADY_ACTIVE', '学生已经是启用状态', 409);
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: { status: StudentStatus.ACTIVE, deletedAt: null },
    });

    realtimeService.publishClassEvent(classId, {
      id: `${classId}-${studentId}-${Date.now()}`,
      type: ClassEventType.STUDENT_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: { studentId, action: 'CREATED' },
    });

    return updated;
  }

  async delete(userId: string, classId: string, studentId: string) {
    return this.changeStudentLifecycle(userId, classId, studentId, {
      action: 'DELETED',
      deletedAt: new Date(),
      allowInactive: true,
    });
  }

  private async changeStudentLifecycle(
    userId: string,
    classId: string,
    studentId: string,
    options: {
      action: 'DEACTIVATED' | 'DELETED';
      deletedAt: Date | null;
      allowInactive: boolean;
    },
  ) {
    await this.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.student.findFirst({
        where: { id: studentId, classId },
      });
      if (!current) {
        throw new BusinessError('STUDENT_NOT_FOUND', '学生不存在', 404);
      }
      if (current.deletedAt) {
        throw new BusinessError('STUDENT_ALREADY_DELETED', '学生已经删除', 409);
      }
      if (!options.allowInactive && current.status === StudentStatus.INACTIVE) {
        throw new BusinessError('STUDENT_ALREADY_INACTIVE', '学生已经停用', 409);
      }

      const classroom = await tx.classroom.findUnique({
        where: { id: classId },
        select: { currentLayoutVersionId: true },
      });
      if (!classroom) {
        throw new BusinessError('CLASSROOM_NOT_FOUND', '班级不存在', 404);
      }

      const updated = await tx.student.update({
        where: { id: studentId },
        data: { status: StudentStatus.INACTIVE, deletedAt: options.deletedAt },
      });

      let layoutVersion: number | null = null;
      if (classroom.currentLayoutVersionId) {
        const [currentLayout, latestLayout] = await Promise.all([
          tx.seatLayoutVersion.findUnique({
            where: { id: classroom.currentLayoutVersionId },
            select: {
              seats: {
                select: { rowIndex: true, colIndex: true, studentId: true, cellType: true },
              },
            },
          }),
          tx.seatLayoutVersion.findFirst({
            where: { classId },
            orderBy: { version: 'desc' },
            select: { version: true },
          }),
        ]);

        if (currentLayout && currentLayout.seats.some((s) => s.studentId === studentId)) {
          const createdLayout = await tx.seatLayoutVersion.create({
            data: {
              classId,
              version: (latestLayout?.version ?? 0) + 1,
              sourceVersionId: null,
              createdBy: userId,
            },
            select: { id: true, version: true },
          });

          await tx.seat.createMany({
            data: currentLayout.seats.map((seat) => ({
              layoutVersionId: createdLayout.id,
              rowIndex: seat.rowIndex,
              colIndex: seat.colIndex,
              studentId: seat.studentId === studentId ? null : seat.studentId,
              cellType: seat.cellType,
            })),
          });

          await tx.classroom.update({
            where: { id: classId },
            data: { currentLayoutVersionId: createdLayout.id },
          });

          layoutVersion = createdLayout.version;
        }
      }

      return { updated, layoutVersion };
    });

    realtimeService.publishClassEvent(classId, {
      id: `${classId}-${studentId}-${Date.now()}`,
      type: ClassEventType.STUDENT_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: { studentId, action: options.action },
    });

    if (result.layoutVersion) {
      realtimeService.publishClassEvent(classId, {
        id: `${classId}-layout-${Date.now()}`,
        type: ClassEventType.SEAT_LAYOUT_CHANGED,
        classId,
        occurredAt: new Date().toISOString(),
        payload: { version: result.layoutVersion },
      });
    }

    return result.updated;
  }
}

export const studentsService = new StudentsService();
