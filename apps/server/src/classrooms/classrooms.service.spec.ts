import { TeacherRole } from '@prisma/client';
import { BusinessException } from '../common';
import { PrismaService } from '../prisma';
import { ClassroomsService } from './classrooms.service';

describe('ClassroomsService authorization', () => {
  it('rejects access across classroom scope', async () => {
    const prisma = {
      classTeacher: { findFirst: jest.fn(async () => null) },
    } as unknown as PrismaService;
    const service = new ClassroomsService(prisma);

    await expect(service.get('teacher-a', 'class-b')).rejects.toMatchObject<
      Partial<BusinessException>
    >({ code: 'FORBIDDEN_CLASS_ACCESS' });
  });

  it('rejects subject-teacher write operations in the service layer', async () => {
    const prisma = {
      classTeacher: { findFirst: jest.fn(async () => null) },
    } as unknown as PrismaService;
    const service = new ClassroomsService(prisma);

    await expect(
      service.assertAccess('subject-teacher', 'class-1', [TeacherRole.HEAD_TEACHER]),
    ).rejects.toMatchObject<Partial<BusinessException>>({ code: 'FORBIDDEN_CLASS_ACCESS' });
    expect(prisma.classTeacher.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: { in: [TeacherRole.HEAD_TEACHER] } }),
      }),
    );
  });
});
