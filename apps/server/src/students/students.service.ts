import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma, StudentStatus, TeacherRole } from '@prisma/client';
import { BusinessException, ClassEventType } from '../common';
import { ClassroomsService } from '../classrooms';
import { PrismaService } from '../prisma';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { ListStudentsQuery } from './dto/list-students.query';
import { UpdateStudentDto } from './dto/update-student.dto';

const MAX_LAYOUT_VERSION_ATTEMPTS = 3;

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classrooms: ClassroomsService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(userId: string, classId: string, query: ListStudentsQuery) {
    await this.classrooms.assertAccess(userId, classId);
    const where: Prisma.StudentWhereInput = {
      classId,
      status: query.status,
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { studentNo: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [students, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        orderBy: [{ studentNo: 'asc' }, { createdAt: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.student.count({ where }),
    ]);
    return { students, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async create(userId: string, classId: string, dto: CreateStudentDto) {
    await this.classrooms.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    try {
      const student = await this.prisma.student.create({
        data: { classId, name: dto.name, studentNo: dto.studentNo },
      });
      await this.publishStudentChanged(classId, student.id, 'CREATED');
      return student;
    } catch (error) {
      this.rethrowStudentNumberConflict(error);
    }
  }

  async update(userId: string, classId: string, studentId: string, dto: UpdateStudentDto) {
    await this.classrooms.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    const student = await this.prisma.student.findFirst({ where: { id: studentId, classId } });
    if (!student) {
      throw new BusinessException('STUDENT_NOT_FOUND', '学生不存在', HttpStatus.NOT_FOUND);
    }
    try {
      const updated = await this.prisma.student.update({
        where: { id: studentId },
        data: { name: dto.name, studentNo: dto.studentNo },
      });
      await this.publishStudentChanged(classId, studentId, 'UPDATED');
      return updated;
    } catch (error) {
      this.rethrowStudentNumberConflict(error);
    }
  }

  async deactivate(userId: string, classId: string, studentId: string) {
    await this.classrooms.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    const result = await this.withLayoutVersionRetry(() =>
      this.prisma.$transaction(
        async (transaction) => {
          const current = await transaction.student.findFirst({
            where: { id: studentId, classId },
          });
          if (!current) {
            throw new BusinessException('STUDENT_NOT_FOUND', '学生不存在', HttpStatus.NOT_FOUND);
          }
          if (current.status === StudentStatus.INACTIVE) {
            throw new BusinessException(
              'STUDENT_ALREADY_INACTIVE',
              '学生已经停用',
              HttpStatus.CONFLICT,
            );
          }

          const classroom = await transaction.classroom.findUnique({
            where: { id: classId },
            select: { currentLayoutVersionId: true },
          });
          if (!classroom) {
            throw new BusinessException('CLASS_NOT_FOUND', '班级不存在', HttpStatus.NOT_FOUND);
          }

          const updated = await transaction.student.update({
            where: { id: studentId },
            data: { status: StudentStatus.INACTIVE },
          });
          let layoutVersion: number | null = null;

          if (classroom.currentLayoutVersionId) {
            const [currentLayout, latestLayout] = await Promise.all([
              transaction.seatLayoutVersion.findUnique({
                where: { id: classroom.currentLayoutVersionId },
                select: {
                  seats: {
                    select: { rowIndex: true, colIndex: true, studentId: true, cellType: true },
                  },
                },
              }),
              transaction.seatLayoutVersion.findFirst({
                where: { classId },
                orderBy: { version: 'desc' },
                select: { version: true },
              }),
            ]);
            if (!currentLayout) {
              throw new BusinessException(
                'SEAT_LAYOUT_VERSION_CONFLICT',
                '当前座位布局不存在，请重新加载',
                HttpStatus.CONFLICT,
              );
            }

            const createdLayout = await transaction.seatLayoutVersion.create({
              data: {
                classId,
                version: (latestLayout?.version ?? 0) + 1,
                sourceVersionId: null,
                createdBy: userId,
              },
              select: { id: true, version: true },
            });
            if (currentLayout.seats.length > 0) {
              await transaction.seat.createMany({
                data: currentLayout.seats.map((seat) => ({
                  layoutVersionId: createdLayout.id,
                  rowIndex: seat.rowIndex,
                  colIndex: seat.colIndex,
                  studentId: seat.studentId === studentId ? null : seat.studentId,
                  cellType: seat.cellType,
                })),
              });
            }
            const activated = await transaction.classroom.updateMany({
              where: { id: classId, currentLayoutVersionId: classroom.currentLayoutVersionId },
              data: { currentLayoutVersionId: createdLayout.id },
            });
            if (activated.count !== 1) {
              throw new BusinessException(
                'SEAT_LAYOUT_VERSION_CONFLICT',
                '座位布局已发生变化，请重新加载',
                HttpStatus.CONFLICT,
              );
            }
            layoutVersion = createdLayout.version;
          }

          return { student: updated, layoutVersion };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

    await this.publishStudentChanged(classId, studentId, 'DEACTIVATED');
    if (result.layoutVersion !== null) {
      await this.publishSafely(classId, ClassEventType.SEAT_LAYOUT_CHANGED, {
        version: result.layoutVersion,
      });
    }
    return result.student;
  }

  private async publishStudentChanged(
    classId: string,
    studentId: string,
    action: string,
  ): Promise<void> {
    await this.publishSafely(classId, ClassEventType.STUDENT_CHANGED, { studentId, action });
  }

  private async publishSafely(
    classId: string,
    type: ClassEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event = {
      id: randomUUID(),
      type,
      classId,
      occurredAt: new Date().toISOString(),
      payload,
    };
    try {
      await Promise.resolve(this.realtime.publishClassEvent(classId, event));
    } catch (error) {
      this.logger.error(`Realtime publication failed after student commit: ${String(error)}`);
    }
  }

  private async withLayoutVersionRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_LAYOUT_VERSION_ATTEMPTS; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const retryable =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          ((error as { code?: unknown }).code === 'P2002' ||
            (error as { code?: unknown }).code === 'P2034');
        if (!retryable || attempt === MAX_LAYOUT_VERSION_ATTEMPTS) {
          if (retryable) {
            throw new BusinessException(
              'SEAT_LAYOUT_VERSION_CONFLICT',
              '座位布局已发生变化，请重试',
              HttpStatus.CONFLICT,
            );
          }
          throw error;
        }
      }
    }
    throw new BusinessException(
      'SEAT_LAYOUT_VERSION_CONFLICT',
      '座位布局已发生变化，请重试',
      HttpStatus.CONFLICT,
    );
  }

  private rethrowStudentNumberConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BusinessException(
        'STUDENT_NUMBER_CONFLICT',
        '该班级的学号已经存在',
        HttpStatus.CONFLICT,
      );
    }
    throw error;
  }
}
