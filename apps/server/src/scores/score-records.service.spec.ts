import { ScoreRecordType, TeacherRole } from '@prisma/client';
import type { PrismaService } from '../prisma';
import type { RealtimeService } from '../realtime/realtime.service';
import { ScoreRecordsService } from './score-records.service';

describe('ScoreRecordsService', () => {
  const baseRecord = {
    id: 'record-1',
    classId: 'class-1',
    studentId: 'student-1',
    operatorId: 'teacher-1',
    subject: '数学',
    ruleId: 'rule-1',
    delta: 3,
    reason: null,
    recordType: ScoreRecordType.NORMAL,
    revertedRecordId: null,
    createdAt: new Date('2026-08-25T01:00:00.000Z'),
    occurredAt: new Date('2026-08-25T01:00:00.000Z'),
    periodId: null,
    eventId: null,
    violation: false,
    student: { id: 'student-1', name: '张三' },
    operator: { id: 'teacher-1', name: '王老师' },
    rule: { id: 'rule-1', name: '回答问题' },
    reversion: null,
  };

  function setup() {
    const tx = {
      student: { findFirst: jest.fn().mockResolvedValue({ id: 'student-1' }) },
      classTeacher: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ role: TeacherRole.SUBJECT_TEACHER, subject: '数学' }),
      },
      scoreRule: {
        findFirst: jest.fn().mockResolvedValue({ id: 'rule-1', delta: 3, enabled: true }),
      },
      scoreRecord: {
        create: jest.fn().mockResolvedValue(baseRecord),
        findFirst: jest.fn().mockResolvedValue(baseRecord),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $queryRaw: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn((argument) => {
        if (typeof argument === 'function') return argument(tx);
        return Promise.all(argument);
      }),
      scoreRecord: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    } as unknown as PrismaService;
    const realtime = {
      publishClassEvent: jest.fn(),
    } as unknown as RealtimeService;
    return { service: new ScoreRecordsService(prisma, realtime), prisma, realtime, tx };
  }

  it('copies the current rule delta and publishes score/ranking only after commit', async () => {
    const { service, prisma, realtime, tx } = setup();
    const callOrder: string[] = [];
    (tx.scoreRecord.create as jest.Mock).mockImplementation(async ({ data }) => {
      callOrder.push('write');
      return { ...baseRecord, ...data };
    });
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const result = await callback(tx);
      callOrder.push('commit');
      return result;
    });
    (realtime.publishClassEvent as jest.Mock).mockImplementation(() => callOrder.push('publish'));

    const result = await service.createFromRule('class-1', 'teacher-1', {
      studentId: 'student-1',
      ruleId: 'rule-1',
    });

    expect(tx.scoreRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ delta: 3, subject: '数学', recordType: 'NORMAL' }),
      }),
    );
    expect(result.delta).toBe(3);
    expect(callOrder).toEqual(['write', 'commit', 'publish', 'publish']);
    expect(realtime.publishClassEvent).toHaveBeenCalledTimes(2);
  });

  it('rejects a student outside the class without creating a record', async () => {
    const { service, tx } = setup();
    tx.student.findFirst.mockResolvedValue(null);

    await expect(
      service.createFromRule('class-1', 'teacher-1', {
        studentId: 'student-other-class',
        ruleId: 'rule-1',
      }),
    ).rejects.toMatchObject({ code: 'STUDENT_NOT_FOUND' });
    expect(tx.scoreRecord.create).not.toHaveBeenCalled();
  });

  it('rejects a rule or operator without an active same-class relationship', async () => {
    const { service, tx } = setup();
    tx.scoreRule.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.createFromRule('class-1', 'teacher-1', {
        studentId: 'student-1',
        ruleId: 'rule-other-class',
      }),
    ).rejects.toMatchObject({ code: 'SCORE_RULE_NOT_FOUND' });

    tx.classTeacher.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.createFromRule('class-1', 'teacher-other-class', {
        studentId: 'student-1',
        ruleId: 'rule-1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_CLASS_ACCESS' });
    expect(tx.scoreRecord.create).not.toHaveBeenCalled();
  });

  it('creates custom score with a trimmed detailed reason and rejects zero delta', async () => {
    const { service, tx } = setup();
    (tx.scoreRecord.create as jest.Mock).mockImplementation(async ({ data }) => ({
      ...baseRecord,
      ...data,
      rule: null,
    }));

    await service.createCustom('class-1', 'teacher-1', {
      studentId: 'student-1',
      delta: -5,
      reason: '  课堂完成高难度题目并帮助同学  ',
    });
    expect(tx.scoreRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          delta: -5,
          reason: '课堂完成高难度题目并帮助同学',
          ruleId: null,
        }),
      }),
    );

    await expect(
      service.createCustom('class-1', 'teacher-1', {
        studentId: 'student-1',
        delta: 0,
        reason: '这是一个足够长的详细原因',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SCORE_DELTA' });

    await expect(
      service.createCustom('class-1', 'teacher-1', {
        studentId: 'student-1',
        delta: 1,
        reason: '   原因太短   ',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SCORE_REASON' });
  });

  it('applies all score-flow filters and returns pagination metadata', async () => {
    const { service, prisma } = setup();
    (prisma.scoreRecord.findMany as jest.Mock).mockResolvedValue([baseRecord]);
    (prisma.scoreRecord.count as jest.Mock).mockResolvedValue(21);

    const result = await service.list('class-1', {
      studentId: 'student-1',
      operatorId: 'teacher-1',
      from: '2026-08-24T00:00:00.000Z',
      to: '2026-08-25T00:00:00.000Z',
      page: 2,
      pageSize: 10,
    });

    expect(prisma.scoreRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classId: 'class-1',
          studentId: 'student-1',
          operatorId: 'teacher-1',
          createdAt: {
            gte: new Date('2026-08-24T00:00:00.000Z'),
            lte: new Date('2026-08-25T00:00:00.000Z'),
          },
        }),
        skip: 10,
        take: 10,
      }),
    );
    expect(result.meta).toEqual({ page: 2, pageSize: 10, total: 21 });
  });

  it('does not turn a post-commit realtime failure into a score failure', async () => {
    const { service, realtime } = setup();
    (realtime.publishClassEvent as jest.Mock).mockImplementation(() => {
      throw new Error('socket unavailable');
    });

    await expect(
      service.createFromRule('class-1', 'teacher-1', {
        studentId: 'student-1',
        ruleId: 'rule-1',
      }),
    ).resolves.toMatchObject({ id: 'record-1' });
  });

  it('allows a head teacher to create an immutable reverse record', async () => {
    const { service, realtime, tx } = setup();
    tx.$queryRaw.mockResolvedValue([
      {
        id: 'original-1',
        classId: 'class-1',
        studentId: 'student-1',
        operatorId: 'other-teacher',
        ruleId: 'rule-1',
        delta: 3,
        recordType: ScoreRecordType.NORMAL,
      },
    ]);
    tx.scoreRecord.findFirst.mockResolvedValue({
      id: 'original-1',
      classId: 'class-1',
      studentId: 'student-1',
      operatorId: 'other-teacher',
      ruleId: 'rule-1',
      delta: 3,
      recordType: ScoreRecordType.NORMAL,
    });
    tx.classTeacher.findFirst.mockResolvedValue({
      role: TeacherRole.HEAD_TEACHER,
      subject: null,
    });
    tx.scoreRecord.create.mockResolvedValue({
      ...baseRecord,
      id: 'revert-1',
      delta: -3,
      recordType: ScoreRecordType.REVERT,
      revertedRecordId: 'original-1',
    });

    await service.revert('class-1', 'original-1', 'head-teacher');

    expect(tx.scoreRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          delta: -3,
          recordType: ScoreRecordType.REVERT,
          revertedRecordId: 'original-1',
        }),
      }),
    );
    expect(realtime.publishClassEvent).toHaveBeenCalledTimes(2);
  });

  it('forbids a subject teacher from reverting another operator record', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValue([
      {
        id: 'original-1',
        classId: 'class-1',
        studentId: 'student-1',
        operatorId: 'other-teacher',
        ruleId: null,
        delta: 1,
        recordType: ScoreRecordType.NORMAL,
      },
    ]);
    tx.scoreRecord.findFirst.mockResolvedValue({
      id: 'original-1',
      classId: 'class-1',
      studentId: 'student-1',
      operatorId: 'other-teacher',
      ruleId: null,
      delta: 1,
      recordType: ScoreRecordType.NORMAL,
    });

    await expect(service.revert('class-1', 'original-1', 'teacher-1')).rejects.toMatchObject({
      code: 'FORBIDDEN_SCORE_REVERT',
    });
    expect(tx.scoreRecord.create).not.toHaveBeenCalled();
  });

  it('returns a stable conflict for a repeated or concurrent revert', async () => {
    const { service, prisma, tx } = setup();
    tx.$queryRaw.mockResolvedValue([
      {
        id: 'original-1',
        classId: 'class-1',
        studentId: 'student-1',
        operatorId: 'teacher-1',
        ruleId: null,
        delta: 1,
        recordType: ScoreRecordType.NORMAL,
      },
    ]);
    tx.scoreRecord.findUnique.mockResolvedValue({ id: 'existing-revert' });

    await expect(service.revert('class-1', 'original-1', 'teacher-1')).rejects.toMatchObject({
      code: 'SCORE_RECORD_ALREADY_REVERTED',
      status: 409,
    });

    (prisma.$transaction as jest.Mock).mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.revert('class-1', 'original-1', 'teacher-1')).rejects.toMatchObject({
      code: 'SCORE_RECORD_ALREADY_REVERTED',
      status: 409,
    });
  });

  it('never allows a REVERT record to be reverted', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValue([
      {
        id: 'revert-1',
        classId: 'class-1',
        studentId: 'student-1',
        operatorId: 'teacher-1',
        ruleId: null,
        delta: -1,
        recordType: ScoreRecordType.REVERT,
      },
    ]);
    tx.scoreRecord.findFirst.mockResolvedValue({
      id: 'revert-1',
      classId: 'class-1',
      studentId: 'student-1',
      operatorId: 'teacher-1',
      ruleId: null,
      delta: -1,
      recordType: ScoreRecordType.REVERT,
    });

    await expect(service.revert('class-1', 'revert-1', 'teacher-1')).rejects.toMatchObject({
      code: 'SCORE_RECORD_NOT_REVERTIBLE',
    });
    expect(tx.scoreRecord.create).not.toHaveBeenCalled();
  });
});
