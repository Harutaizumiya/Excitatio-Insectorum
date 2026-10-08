import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAllStudents } from './students.ts';
import type { PaginatedEnvelope, Student } from '../lib/api.ts';

test('名单超过100人时按页读取直到总数完整', async () => {
  const requests: number[] = [];
  const students = await loadAllStudents('class-1', async (_classId, query) => {
    requests.push(query.page);
    const start = (query.page - 1) * query.pageSize;
    const count = Math.min(query.pageSize, 205 - start);
    return {
      data: Array.from({ length: count }, (_, index) => ({ id: `s-${start + index}` })),
      meta: { page: query.page, pageSize: query.pageSize, total: 205 },
    } as unknown as PaginatedEnvelope<Student>;
  });
  assert.equal(students.length, 205);
  assert.deepEqual(requests, [1, 2, 3]);
});

test('切班后忽略迟到的学生分页响应', async () => {
  let current = true;
  let completed = false;
  const students = await loadAllStudents(
    'old-class',
    async () => {
      current = false;
      return {
        data: [{ id: 'old-student' }],
        meta: { page: 1, pageSize: 100, total: 1 },
      } as unknown as PaginatedEnvelope<Student>;
    },
    100,
    () => current,
  );
  completed = students.length === 0;
  assert.equal(completed, true);
});
