import { HttpStatus, Injectable } from '@nestjs/common';
import { RelationStatus, StudentStatus } from '@prisma/client';
import { BusinessException } from '../common';
import { PrismaService } from '../prisma';
import type { CommitteeAssignmentInputDto, UpdateCommitteeDto } from './dto';

@Injectable()
export class ScoreCommitteeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(classId: string) {
    const assignments = await this.prisma.classCommitteeAssignment.findMany({
      where: { classId, status: RelationStatus.ACTIVE },
      include: { student: { select: { name: true } } },
      orderBy: [{ role: 'asc' }, { termStartAt: 'desc' }, { studentId: 'asc' }],
    });
    return assignments.map((assignment) => this.toResponse(assignment));
  }

  async replace(classId: string, dto: UpdateCommitteeDto) {
    const normalized = dto.assignments.map((assignment) => this.normalizeAssignment(assignment));
    const keys = new Set<string>();
    for (const assignment of normalized) {
      const key = `${assignment.studentId}:${assignment.role}:${assignment.termStartAt.toISOString()}`;
      if (keys.has(key))
        throw new BusinessException('DUPLICATE_COMMITTEE_ASSIGNMENT', '班委名单存在重复项');
      keys.add(key);
    }

    await this.prisma.$transaction(async (tx) => {
      const students = await tx.student.findMany({
        where: {
          classId,
          id: { in: normalized.map((assignment) => assignment.studentId) },
          status: StudentStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (students.length !== new Set(normalized.map((assignment) => assignment.studentId)).size) {
        throw new BusinessException(
          'STUDENT_NOT_FOUND',
          '班委必须是本班在班学生',
          HttpStatus.NOT_FOUND,
        );
      }
      await tx.classCommitteeAssignment.updateMany({
        where: { classId, status: RelationStatus.ACTIVE },
        data: { status: RelationStatus.REVOKED },
      });
      if (normalized.length > 0) {
        await tx.classCommitteeAssignment.createMany({
          data: normalized.map((assignment) => ({
            classId,
            studentId: assignment.studentId,
            role: assignment.role,
            subject: assignment.subject,
            termStartAt: assignment.termStartAt,
            termEndAt: assignment.termEndAt,
            trialEndsAt: assignment.trialEndsAt,
            status: RelationStatus.ACTIVE,
          })),
        });
      }
    });
    return this.list(classId);
  }

  private normalizeAssignment(assignment: CommitteeAssignmentInputDto) {
    const termStartAt = new Date(assignment.termStartAt);
    const termEndAt = assignment.termEndAt ? new Date(assignment.termEndAt) : null;
    const trialEndsAt = assignment.trialEndsAt
      ? new Date(assignment.trialEndsAt)
      : new Date(termStartAt.getTime() + 31 * 24 * 60 * 60 * 1000);
    if (
      Number.isNaN(termStartAt.getTime()) ||
      (termEndAt && Number.isNaN(termEndAt.getTime())) ||
      Number.isNaN(trialEndsAt.getTime())
    ) {
      throw new BusinessException('INVALID_COMMITTEE_TERM', '班委任期时间无效');
    }
    if ((termEndAt && termEndAt <= termStartAt) || trialEndsAt < termStartAt) {
      throw new BusinessException('INVALID_COMMITTEE_TERM', '班委任期范围无效');
    }
    return {
      studentId: assignment.studentId,
      role: assignment.role.trim(),
      subject: assignment.subject?.trim() || null,
      termStartAt,
      termEndAt,
      trialEndsAt,
    };
  }

  private toResponse(assignment: {
    id: string;
    studentId: string;
    role: string;
    subject: string | null;
    termStartAt: Date;
    termEndAt: Date | null;
    trialEndsAt: Date | null;
    status: RelationStatus;
    student: { name: string };
  }) {
    return {
      id: assignment.id,
      studentId: assignment.studentId,
      studentName: assignment.student.name,
      role: assignment.role,
      subject: assignment.subject,
      termStartAt: assignment.termStartAt,
      termEndAt: assignment.termEndAt,
      trialEndsAt: assignment.trialEndsAt,
      status: assignment.status,
    };
  }
}
