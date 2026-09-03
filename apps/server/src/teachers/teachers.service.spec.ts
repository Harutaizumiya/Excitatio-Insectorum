import { TeacherRole } from '@prisma/client';
import type { ClassroomsService } from '../classrooms';
import type { PrismaService } from '../prisma';
import type { RealtimeService } from '../realtime';
import type { PasswordHasherService } from '../auth';
import type { ConfigService } from '@nestjs/config';
import { TeachersService } from './teachers.service';

describe('TeachersService remove', () => {
  it('removes a subject-teacher relation and keeps audit users and records intact', async () => {
    const transaction = {
      classTeacher: {
        findFirst: jest.fn().mockResolvedValue({ teacherId: 'teacher-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      teacherInvitation: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      scheduleEntry: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      session: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<string>) =>
        callback(transaction),
      ),
    } as unknown as PrismaService;
    const classrooms = {
      assertAccess: jest.fn().mockResolvedValue({ role: TeacherRole.HEAD_TEACHER }),
    } as unknown as ClassroomsService;
    const realtime = {
      disconnectUser: jest.fn(),
    } as unknown as RealtimeService;
    const service = new TeachersService(
      prisma,
      classrooms,
      {} as PasswordHasherService,
      {} as ConfigService,
      realtime,
    );

    await expect(service.remove('head-1', 'class-1', 'relation-1')).resolves.toBeUndefined();

    expect(classrooms.assertAccess).toHaveBeenCalledWith('head-1', 'class-1', [
      TeacherRole.HEAD_TEACHER,
    ]);
    expect(transaction.teacherInvitation.deleteMany).toHaveBeenCalledWith({
      where: { classTeacherId: 'relation-1' },
    });
    expect(transaction.scheduleEntry.updateMany).toHaveBeenCalledWith({
      where: { classTeacherId: 'relation-1' },
      data: { classTeacherId: null },
    });
    expect(transaction.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'teacher-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(transaction.classTeacher.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'relation-1',
        classId: 'class-1',
        role: TeacherRole.SUBJECT_TEACHER,
      },
    });
    expect(realtime.disconnectUser).toHaveBeenCalledWith('teacher-1');
  });

  it('rejects attempts to remove a missing or non-subject relation before changing data', async () => {
    const transaction = {
      classTeacher: {
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn(),
      },
      teacherInvitation: { deleteMany: jest.fn() },
      scheduleEntry: { updateMany: jest.fn() },
      session: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as unknown as PrismaService;
    const classrooms = {
      assertAccess: jest.fn().mockResolvedValue({ role: TeacherRole.HEAD_TEACHER }),
    } as unknown as ClassroomsService;
    const service = new TeachersService(
      prisma,
      classrooms,
      {} as PasswordHasherService,
      {} as ConfigService,
    );

    await expect(service.remove('head-1', 'class-1', 'missing-relation')).rejects.toMatchObject({
      code: 'CLASS_TEACHER_NOT_FOUND',
    });
    expect(transaction.classTeacher.deleteMany).not.toHaveBeenCalled();
    expect(transaction.teacherInvitation.deleteMany).not.toHaveBeenCalled();
    expect(transaction.scheduleEntry.updateMany).not.toHaveBeenCalled();
  });
});
