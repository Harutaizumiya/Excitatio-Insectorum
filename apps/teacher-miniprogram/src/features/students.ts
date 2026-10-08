import type { PaginatedEnvelope, Student } from '../lib/api.ts';

export type StudentPageLoader = (
  classId: string,
  query: { page: number; pageSize: number },
) => Promise<PaginatedEnvelope<Student>>;

export async function loadAllStudents(
  classId: string,
  loadPage: StudentPageLoader,
  pageSize = 100,
  isCurrent: () => boolean = () => true,
): Promise<Student[]> {
  const students: Student[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (students.length < total) {
    if (!isCurrent()) return [];
    const result = await loadPage(classId, { page, pageSize });
    if (!isCurrent()) return [];
    students.push(...result.data);
    total = result.meta.total;
    if (result.data.length === 0) break;
    page += 1;
  }
  return students;
}

export function studentSeatLabel(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}
