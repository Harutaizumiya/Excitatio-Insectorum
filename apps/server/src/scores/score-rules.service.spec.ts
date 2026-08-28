import { TeacherRole } from '@prisma/client';
import { BusinessException } from '../common';
import type { PrismaService } from '../prisma';
import { ScoreRulesService } from './score-rules.service';

describe('ScoreRulesService', () => {
  function setup(relation: { id: string } | null = { id: 'link-1' }) {
    const tx = {
      classTeacher: { findFirst: jest.fn().mockResolvedValue(relation) },
      scoreRule: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'rule-1', ...data })),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      scoreRule: { findMany: jest.fn() },
    } as unknown as PrismaService;
    return { service: new ScoreRulesService(prisma), tx };
  }

  it('creates a non-zero positive or negative rule for an active head teacher', async () => {
    const { service, tx } = setup();

    await service.create('class-1', 'teacher-1', {
      name: '  回答问题  ',
      delta: -2,
      description: '课堂规则',
    });

    expect(tx.classTeacher.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classId: 'class-1',
          teacherId: 'teacher-1',
          role: TeacherRole.HEAD_TEACHER,
        }),
      }),
    );
    expect(tx.scoreRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ classId: 'class-1', name: '回答问题', delta: -2 }),
    });
  });

  it('rejects zero delta even when called without DTO validation', async () => {
    const { service } = setup();

    await expect(
      service.create('class-1', 'teacher-1', { name: '无效规则', delta: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_SCORE_DELTA' } satisfies Partial<BusinessException>);
  });

  it('keeps subject teachers read-only at the service boundary', async () => {
    const { service, tx } = setup(null);

    await expect(
      service.create('class-1', 'subject-teacher', { name: '回答问题', delta: 2 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE' } satisfies Partial<BusinessException>);
    expect(tx.scoreRule.create).not.toHaveBeenCalled();
  });
});
