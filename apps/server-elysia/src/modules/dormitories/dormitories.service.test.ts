import assert from 'node:assert/strict';
import test from 'node:test';
import { BusinessError } from '../../plugins/error-handler';
import { DormitoriesService } from './dormitories.service';

function createMemberHarness(foundStudentIds: string[]) {
  const writes = {
    updates: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
    realtime: [] as Array<Record<string, unknown>>,
  };
  const dormitory = {
    id: 'dorm-2',
    classId: 'class-1',
    name: '302',
    createdAt: new Date(),
    updatedAt: new Date(),
    students: foundStudentIds.map((id) => ({ id, name: id, studentNo: null })),
  };
  const tx = {
    dormitory: {
      findFirst: async () => dormitory,
      findUniqueOrThrow: async () => dormitory,
    },
    student: {
      findMany: async () => foundStudentIds.map((id) => ({ id })),
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        writes.updates.push(args);
        return { count: foundStudentIds.length };
      },
    },
  };
  const db = {
    classTeacher: { findFirst: async () => ({ teacherId: 'teacher-1' }) },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  const realtime = {
    publishClassEvent: (_classId: string, event: Record<string, unknown>) => {
      writes.realtime.push(event);
    },
  };
  return {
    service: new DormitoriesService(db as never, {} as never, realtime as never),
    writes,
  };
}

test('assigning members moves the selected active students to the requested dormitory', async () => {
  const { service, writes } = createMemberHarness(['student-1', 'student-2']);

  const result = await service.addMembers('class-1', 'dorm-2', 'teacher-1', [
    'student-1',
    'student-2',
  ]);

  assert.equal(result.id, 'dorm-2');
  assert.deepEqual(writes.updates[0]?.data, { dormitoryId: 'dorm-2' });
  assert.deepEqual(writes.updates[0]?.where, {
    classId: 'class-1',
    id: { in: ['student-1', 'student-2'] },
    status: 'ACTIVE',
    deletedAt: null,
  });
  assert.equal(writes.realtime.length, 1);
});

test('cross-class, inactive, or deleted students abort the whole member assignment', async () => {
  const { service, writes } = createMemberHarness(['student-1']);

  await assert.rejects(
    service.addMembers('class-1', 'dorm-2', 'teacher-1', ['student-1', 'unavailable-student']),
    (error: unknown) => error instanceof BusinessError && error.code === 'STUDENT_NOT_FOUND',
  );
  assert.equal(writes.updates.length, 0);
  assert.equal(writes.realtime.length, 0);
});
