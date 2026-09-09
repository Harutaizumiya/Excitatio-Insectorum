import { StudentStatus, TeacherRole } from '@prisma/client';
import { ClassEventType } from '../common';
import { ClassroomsService } from '../classrooms';
import { PrismaService } from '../prisma';
import { RealtimeService } from '../realtime';
import { StudentsService } from './students.service';

describe('StudentsService deactivate', () => {
  it('deactivates by cloning the current layout so historical snapshots stay immutable', async () => {
    const student = {
      id: 'student-1',
      classId: 'class-1',
      status: StudentStatus.ACTIVE,
    };
    const transaction = {
      student: {
        findFirst: jest.fn(async () => student),
        update: jest.fn(async () => ({ ...student, status: StudentStatus.INACTIVE })),
      },
      classroom: {
        findUnique: jest.fn(async () => ({ currentLayoutVersionId: 'layout-1' })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      seatLayoutVersion: {
        findUnique: jest.fn(async () => ({
          seats: [
            { rowIndex: 0, colIndex: 0, studentId: 'student-1' },
            { rowIndex: 0, colIndex: 1, studentId: 'student-2' },
          ],
        })),
        findFirst: jest.fn(async () => ({ version: 1 })),
        create: jest.fn(async () => ({ id: 'layout-2', version: 2 })),
      },
      seat: { createMany: jest.fn(async () => ({ count: 2 })) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as unknown as PrismaService;
    const classrooms = {
      assertAccess: jest.fn(async () => ({ role: 'HEAD_TEACHER' })),
    } as unknown as ClassroomsService;
    const realtime = { publishClassEvent: jest.fn() } as unknown as RealtimeService;
    const service = new StudentsService(prisma, classrooms, realtime);

    await expect(service.deactivate('head-1', 'class-1', 'student-1')).resolves.toMatchObject({
      status: StudentStatus.INACTIVE,
    });
    expect(transaction.seatLayoutVersion.create).toHaveBeenCalledWith({
      data: {
        classId: 'class-1',
        version: 2,
        sourceVersionId: null,
        createdBy: 'head-1',
      },
      select: { id: true, version: true },
    });
    expect(transaction.seat.createMany).toHaveBeenCalledWith({
      data: [
        { layoutVersionId: 'layout-2', rowIndex: 0, colIndex: 0, studentId: null },
        { layoutVersionId: 'layout-2', rowIndex: 0, colIndex: 1, studentId: 'student-2' },
      ],
    });
    expect(realtime.publishClassEvent).toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({ type: ClassEventType.STUDENT_CHANGED }),
    );
    expect(realtime.publishClassEvent).toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({
        type: ClassEventType.SEAT_LAYOUT_CHANGED,
        payload: { version: 2 },
      }),
    );
  });
});

describe('StudentsService student lifecycle', () => {
  it('does not expose soft-deleted students to subject teachers', async () => {
    const prisma = {
      student: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    } as unknown as PrismaService;
    const classrooms = {
      assertAccess: jest.fn(async () => ({ role: TeacherRole.SUBJECT_TEACHER })),
    } as unknown as ClassroomsService;
    const realtime = { publishClassEvent: jest.fn() } as unknown as RealtimeService;
    const service = new StudentsService(prisma, classrooms, realtime);

    await service.list('teacher-1', 'class-1', { includeDeleted: true, page: 1, pageSize: 20 });

    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { classId: 'class-1', deletedAt: null, status: undefined },
      }),
    );
  });

  it('soft deletes an inactive student without touching score records', async () => {
    const student = {
      id: 'student-1',
      classId: 'class-1',
      status: StudentStatus.INACTIVE,
      deletedAt: null,
    };
    const transaction = {
      student: {
        findFirst: jest.fn(async () => student),
        update: jest.fn(async () => ({
          ...student,
          status: StudentStatus.INACTIVE,
          deletedAt: new Date('2026-09-03T00:00:00.000Z'),
        })),
      },
      classroom: {
        findUnique: jest.fn(async () => ({ currentLayoutVersionId: null })),
      },
      classCommitteeAssignment: {
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as unknown as PrismaService;
    const classrooms = {
      assertAccess: jest.fn(async () => ({ role: 'HEAD_TEACHER' })),
    } as unknown as ClassroomsService;
    const realtime = { publishClassEvent: jest.fn() } as unknown as RealtimeService;
    const service = new StudentsService(prisma, classrooms, realtime);

    await expect(service.delete('head-1', 'class-1', 'student-1')).resolves.toMatchObject({
      status: StudentStatus.INACTIVE,
      deletedAt: expect.any(Date),
    });
    expect(transaction.classCommitteeAssignment.updateMany).toHaveBeenCalledWith({
      where: { classId: 'class-1', studentId: 'student-1', status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
    expect(realtime.publishClassEvent).toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({
        type: ClassEventType.STUDENT_CHANGED,
        payload: { studentId: 'student-1', action: 'DELETED' },
      }),
    );
  });

  it('restores an inactive student and clears the soft-delete timestamp', async () => {
    const current = {
      id: 'student-1',
      classId: 'class-1',
      status: StudentStatus.INACTIVE,
      deletedAt: new Date('2026-09-03T00:00:00.000Z'),
    };
    const prisma = {
      student: {
        findFirst: jest.fn(async () => current),
        update: jest.fn(async () => ({
          ...current,
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        })),
      },
    } as unknown as PrismaService;
    const classrooms = {
      assertAccess: jest.fn(async () => ({ role: 'HEAD_TEACHER' })),
    } as unknown as ClassroomsService;
    const realtime = { publishClassEvent: jest.fn() } as unknown as RealtimeService;
    const service = new StudentsService(prisma, classrooms, realtime);

    await expect(service.restore('head-1', 'class-1', 'student-1')).resolves.toMatchObject({
      status: StudentStatus.ACTIVE,
      deletedAt: null,
    });
    expect(prisma.student.update).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: { status: StudentStatus.ACTIVE, deletedAt: null },
    });
  });
});
