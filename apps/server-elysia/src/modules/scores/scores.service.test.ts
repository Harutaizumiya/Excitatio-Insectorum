import assert from 'node:assert/strict';
import test from 'node:test';
import { RelationStatus, TeacherRole, type PrismaClient } from '@prisma/client';
import { ScoresService } from './scores.service';

test('committee replacement reuses history and remains idempotent for repeated saves', async () => {
  const students = new Map([
    ['student-1', '甲'],
    ['student-2', '乙'],
  ]);
  const assignments = [
    {
      id: 'assignment-1',
      classId: 'class-1',
      studentId: 'student-1',
      role: '班长',
      subject: '语文',
      termStartAt: new Date('2026-09-01T00:00:00.000Z'),
      termEndAt: null as Date | null,
      trialEndsAt: null,
      status: RelationStatus.ACTIVE,
    },
  ];
  const createBatchSizes: number[] = [];
  const updateIds: string[] = [];

  const assignmentApi = {
    findMany: async (args: { where?: { status?: RelationStatus }; include?: object }) => {
      const rows = assignments.filter(
        (assignment) => !args.where?.status || assignment.status === args.where.status,
      );
      if (args.include) {
        return rows.map((assignment) => ({
          ...assignment,
          student: { name: students.get(assignment.studentId) },
        }));
      }
      return rows.map((assignment) => ({ ...assignment }));
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<(typeof assignments)[number]>;
    }) => {
      const assignment = assignments.find((item) => item.id === where.id);
      if (!assignment) throw new Error(`missing assignment ${where.id}`);
      Object.assign(assignment, data);
      updateIds.push(where.id);
      return assignment;
    },
    createMany: async ({ data }: { data: Array<(typeof assignments)[number]> }) => {
      createBatchSizes.push(data.length);
      assignments.push(
        ...data.map((item, index) => ({
          ...item,
          id: `assignment-${assignments.length + index + 1}`,
        })),
      );
      return { count: data.length };
    },
  };
  const tx = {
    student: {
      findMany: async (args: { where?: { id?: { in?: string[] } } }) => {
        const ids = args.where?.id?.in ?? [...students.keys()];
        return ids.filter((id) => students.has(id)).map((id) => ({ id }));
      },
    },
    classCommitteeAssignment: assignmentApi,
  };
  const db = {
    classTeacher: { findFirst: async () => ({ role: TeacherRole.HEAD_TEACHER }) },
    student: tx.student,
    classCommitteeAssignment: assignmentApi,
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaClient;
  const service = new ScoresService(db);

  const original = {
    studentId: 'student-1',
    role: ' 班长 ',
    subject: '语文',
    termStartAt: '2026-09-01T00:00:00.000Z',
  };
  await service.replaceCommittee('class-1', 'teacher-1', [original]);
  assert.equal(assignments.length, 1);
  assert.deepEqual(createBatchSizes, []);

  const expanded = [
    original,
    {
      studentId: 'student-1',
      role: '学习委员',
      termStartAt: '2026-09-01T00:00:00.000Z',
    },
    {
      studentId: 'student-1',
      role: '学习委员',
      termStartAt: '2026-09-01T00:00:00.000Z',
    },
    {
      studentId: 'student-2',
      role: '班长',
      termStartAt: '2026-09-01T00:00:00.000Z',
    },
  ];
  await service.replaceCommittee('class-1', 'teacher-1', expanded);
  await service.replaceCommittee('class-1', 'teacher-1', expanded);
  assert.deepEqual(createBatchSizes, [2]);
  assert.equal(
    assignments.filter((assignment) => assignment.status === RelationStatus.ACTIVE).length,
    3,
  );
  assert.equal(
    assignments.find((assignment) => assignment.id === 'assignment-1')?.status,
    RelationStatus.ACTIVE,
  );

  await service.replaceCommittee('class-1', 'teacher-1', [expanded[1]]);
  const updateCountAfterReplacement = updateIds.length;
  await service.replaceCommittee('class-1', 'teacher-1', [expanded[1]]);
  assert.equal(updateIds.length, updateCountAfterReplacement);
  assert.equal(
    assignments.find((assignment) => assignment.id === 'assignment-1')?.status,
    RelationStatus.REVOKED,
  );
  assert.ok(
    assignments.find((assignment) => assignment.id === 'assignment-1')?.termEndAt instanceof Date,
  );
  assert.equal(
    assignments.filter((assignment) => assignment.status === RelationStatus.ACTIVE).length,
    1,
  );
});
