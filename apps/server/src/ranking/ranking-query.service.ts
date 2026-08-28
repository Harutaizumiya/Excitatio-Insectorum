import { Injectable } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import type { RankedStudent } from './ranking.types';

interface StudentTotal {
  studentId: string;
  name: string;
  score: number;
}

export function rankStudentTotals(students: StudentTotal[]): RankedStudent[] {
  const sorted = [...students].sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    return left.studentId < right.studentId ? -1 : left.studentId > right.studentId ? 1 : 0;
  });

  let previousScore: number | undefined;
  let previousRank = 0;
  return sorted.map((student, index) => {
    const rank = previousScore === student.score ? previousRank : index + 1;
    previousScore = student.score;
    previousRank = rank;
    return { ...student, rank };
  });
}

@Injectable()
export class RankingQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async getRanking(classId: string, startAt: Date, endAt: Date): Promise<RankedStudent[]> {
    const students = await this.prisma.student.findMany({
      where: { classId, status: StudentStatus.ACTIVE },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    if (students.length === 0) return [];

    const totals = await this.prisma.scoreRecord.groupBy({
      by: ['studentId'],
      where: {
        classId,
        studentId: { in: students.map((student) => student.id) },
        createdAt: { gte: startAt, lt: endAt },
      },
      _sum: { delta: true },
    });
    const totalByStudentId = new Map(
      totals.map((total) => [total.studentId, total._sum.delta ?? 0]),
    );

    return rankStudentTotals(
      students.map((student) => ({
        studentId: student.id,
        name: student.name,
        score: totalByStudentId.get(student.id) ?? 0,
      })),
    );
  }
}
