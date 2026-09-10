import {
  type Prisma,
  RelationStatus,
  ScoreRecordType,
  StudentStatus,
  TeacherRole,
} from '@prisma/client';
import { prisma } from '../../plugins/prisma';
import { BusinessError } from '../../plugins/error-handler';
import { ClassEventType } from '../realtime/realtime.types';
import { realtimeService } from '../realtime/realtime.service';

export class ScoresService {
  async assertClassAccess(userId: string, classId: string, roles?: TeacherRole[]) {
    const access = await prisma.classTeacher.findFirst({
      where: {
        teacherId: userId,
        classId,
        status: RelationStatus.ACTIVE,
        ...(roles?.length ? { role: { in: roles } } : {}),
      },
    });
    if (!access) {
      throw new BusinessError('FORBIDDEN_CLASS_ACCESS', '无权访问该班级', 403);
    }
    return access;
  }

  // --- Score Rules ---
  async listRules(classId: string, enabled?: boolean) {
    return prisma.scoreRule.findMany({
      where: {
        classId,
        ...(enabled !== undefined ? { enabled } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async createRule(
    classId: string,
    operatorId: string,
    dto: {
      name: string;
      delta: number;
      group?: string;
      description?: string;
      systemPolicyKey?: string;
    },
  ) {
    if (!Number.isInteger(dto.delta) || dto.delta === 0) {
      throw new BusinessError('INVALID_SCORE_DELTA', '积分值必须为非 0 整数', 400);
    }
    const name = dto.name.trim();
    if (!name) {
      throw new BusinessError('INVALID_SCORE_RULE_NAME', '积分规则名称不能为空', 400);
    }

    await this.assertClassAccess(operatorId, classId, [TeacherRole.HEAD_TEACHER]);

    return prisma.scoreRule.create({
      data: {
        classId,
        name,
        group: dto.group?.trim() || undefined,
        delta: dto.delta,
        description: dto.description ?? null,
        systemPolicyKey: dto.systemPolicyKey?.trim() || null,
        createdBy: operatorId,
      },
    });
  }

  async updateRule(
    classId: string,
    ruleId: string,
    operatorId: string,
    dto: {
      name?: string;
      delta?: number;
      group?: string;
      description?: string;
      systemPolicyKey?: string;
      enabled?: boolean;
    },
  ) {
    await this.assertClassAccess(operatorId, classId, [TeacherRole.HEAD_TEACHER]);
    if (dto.delta !== undefined && (!Number.isInteger(dto.delta) || dto.delta === 0)) {
      throw new BusinessError('INVALID_SCORE_DELTA', '积分值必须为非 0 整数', 400);
    }

    const existing = await prisma.scoreRule.findFirst({ where: { id: ruleId, classId } });
    if (!existing) {
      throw new BusinessError('SCORE_RULE_NOT_FOUND', '积分规则不存在', 404);
    }

    return prisma.scoreRule.update({
      where: { id: ruleId },
      data: {
        name: dto.name?.trim(),
        group: dto.group?.trim(),
        delta: dto.delta,
        description: dto.description,
        systemPolicyKey: dto.systemPolicyKey?.trim(),
        enabled: dto.enabled,
      },
    });
  }

  async disableRule(classId: string, ruleId: string, operatorId: string) {
    await this.assertClassAccess(operatorId, classId, [TeacherRole.HEAD_TEACHER]);
    const existing = await prisma.scoreRule.findFirst({ where: { id: ruleId, classId } });
    if (!existing) {
      throw new BusinessError('SCORE_RULE_NOT_FOUND', '积分规则不存在', 404);
    }

    return prisma.scoreRule.update({
      where: { id: ruleId },
      data: { enabled: false },
    });
  }

  // --- Score Records ---
  async createFromRule(
    classId: string,
    operatorId: string,
    dto: { studentId: string; ruleId: string },
  ) {
    const access = await this.assertClassAccess(operatorId, classId);

    const record = await prisma.$transaction(async (tx) => {
      const [student, rule] = await Promise.all([
        tx.student.findFirst({
          where: { id: dto.studentId, classId, status: StudentStatus.ACTIVE, deletedAt: null },
          select: { id: true },
        }),
        tx.scoreRule.findFirst({
          where: { id: dto.ruleId, classId },
          select: { id: true, delta: true, enabled: true },
        }),
      ]);

      if (!student) throw new BusinessError('STUDENT_NOT_FOUND', '学生不存在', 404);
      if (!rule) throw new BusinessError('SCORE_RULE_NOT_FOUND', '积分规则不存在', 404);
      if (!rule.enabled) throw new BusinessError('SCORE_RULE_DISABLED', '该积分规则已停用', 400);

      return tx.scoreRecord.create({
        data: {
          classId,
          studentId: student.id,
          operatorId,
          subject: access.subject,
          ruleId: rule.id,
          delta: rule.delta,
          recordType: ScoreRecordType.NORMAL,
          occurredAt: new Date(),
          violation: rule.delta < 0,
        },
        include: {
          student: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
          rule: { select: { id: true, name: true } },
          reversion: { select: { id: true } },
        },
      });
    });

    realtimeService.publishClassEvent(classId, {
      id: `${classId}-${record.id}-${Date.now()}`,
      type: ClassEventType.SCORE_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: {
        studentId: record.studentId,
        direction: record.delta > 0 ? 'INCREASE' : 'DECREASE',
      },
    });

    return record;
  }

  async createCustom(
    classId: string,
    operatorId: string,
    dto: { studentId: string; delta: number; reason: string },
  ) {
    if (!Number.isInteger(dto.delta) || dto.delta === 0) {
      throw new BusinessError('INVALID_SCORE_DELTA', '积分值必须为非 0 整数', 400);
    }
    const reason = dto.reason.trim();
    if (reason.length < 10) {
      throw new BusinessError('INVALID_SCORE_REASON', '自定义积分原因至少需要 10 个字符', 400);
    }

    const access = await this.assertClassAccess(operatorId, classId);

    const record = await prisma.$transaction(async (tx) => {
      const student = await tx.student.findFirst({
        where: { id: dto.studentId, classId, status: StudentStatus.ACTIVE, deletedAt: null },
        select: { id: true },
      });
      if (!student) throw new BusinessError('STUDENT_NOT_FOUND', '学生不存在', 404);

      return tx.scoreRecord.create({
        data: {
          classId,
          studentId: student.id,
          operatorId,
          subject: access.subject,
          delta: dto.delta,
          reason,
          recordType: ScoreRecordType.NORMAL,
          occurredAt: new Date(),
          violation: dto.delta < 0,
        },
        include: {
          student: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
          rule: { select: { id: true, name: true } },
          reversion: { select: { id: true } },
        },
      });
    });

    realtimeService.publishClassEvent(classId, {
      id: `${classId}-${record.id}-${Date.now()}`,
      type: ClassEventType.SCORE_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: {
        studentId: record.studentId,
        direction: record.delta > 0 ? 'INCREASE' : 'DECREASE',
      },
    });

    return record;
  }

  async listRecords(
    classId: string,
    query: {
      page?: number;
      pageSize?: number;
      studentId?: string;
      operatorId?: string;
      recordType?: ScoreRecordType;
      from?: string;
      to?: string;
    },
  ) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));

    const where: Prisma.ScoreRecordWhereInput = {
      classId,
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.operatorId ? { operatorId: query.operatorId } : {}),
      ...(query.recordType ? { recordType: query.recordType } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [records, total] = await prisma.$transaction([
      prisma.scoreRecord.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          student: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
          rule: { select: { id: true, name: true } },
          reversion: { select: { id: true } },
        },
      }),
      prisma.scoreRecord.count({ where }),
    ]);

    return { data: records, meta: { page, pageSize, total } };
  }

  async revertRecord(classId: string, recordId: string, operatorId: string) {
    const access = await this.assertClassAccess(operatorId, classId);

    const record = await prisma.$transaction(async (tx) => {
      const original = await tx.scoreRecord.findFirst({
        where: { id: recordId, classId },
        include: { reversion: true },
      });

      if (!original) {
        throw new BusinessError('SCORE_RECORD_NOT_FOUND', '积分记录不存在', 404);
      }
      if (original.recordType !== ScoreRecordType.NORMAL) {
        throw new BusinessError('CANNOT_REVERT_REVERT_RECORD', '撤销记录不能被再次撤销', 400);
      }
      if (original.reversion) {
        throw new BusinessError('SCORE_RECORD_ALREADY_REVERTED', '该积分记录已被撤销', 409);
      }

      // Subject teachers can only revert their own records
      if (access.role !== TeacherRole.HEAD_TEACHER && original.operatorId !== operatorId) {
        throw new BusinessError('FORBIDDEN_SCORE_REVERT', '任课教师只能撤销本人登记的积分', 403);
      }

      return tx.scoreRecord.create({
        data: {
          classId,
          studentId: original.studentId,
          operatorId,
          subject: access.subject,
          delta: -original.delta,
          reason: `撤销记录 ${original.id}`,
          recordType: ScoreRecordType.REVERT,
          revertedRecordId: original.id,
          occurredAt: new Date(),
        },
        include: {
          student: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
          rule: { select: { id: true, name: true } },
          reversion: { select: { id: true } },
        },
      });
    });

    realtimeService.publishClassEvent(classId, {
      id: `${classId}-${record.id}-${Date.now()}`,
      type: ClassEventType.SCORE_REVERTED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: {
        studentId: record.studentId,
        recordId,
      },
    });

    return record;
  }

  // --- Committee ---
  async listCommittee(classId: string) {
    const assignments = await prisma.classCommitteeAssignment.findMany({
      where: { classId, status: RelationStatus.ACTIVE },
      include: { student: { select: { name: true } } },
      orderBy: [{ role: 'asc' }, { termStartAt: 'desc' }, { studentId: 'asc' }],
    });
    return assignments.map((a) => ({
      id: a.id,
      studentId: a.studentId,
      studentName: a.student.name,
      role: a.role,
      subject: a.subject,
      termStartAt: a.termStartAt,
      termEndAt: a.termEndAt,
      trialEndsAt: a.trialEndsAt,
      status: a.status,
    }));
  }

  async replaceCommittee(
    classId: string,
    operatorId: string,
    assignments: Array<{
      studentId: string;
      role: string;
      subject?: string | null;
      termStartAt: string;
      termEndAt?: string | null;
      trialEndsAt?: string | null;
    }>,
  ) {
    await this.assertClassAccess(operatorId, classId, [TeacherRole.HEAD_TEACHER]);

    await prisma.$transaction(async (tx) => {
      await tx.classCommitteeAssignment.updateMany({
        where: { classId, status: RelationStatus.ACTIVE },
        data: { status: RelationStatus.REVOKED },
      });

      if (assignments.length > 0) {
        await tx.classCommitteeAssignment.createMany({
          data: assignments.map((a) => ({
            classId,
            studentId: a.studentId,
            role: a.role.trim(),
            subject: a.subject?.trim() || null,
            termStartAt: new Date(a.termStartAt),
            termEndAt: a.termEndAt ? new Date(a.termEndAt) : null,
            trialEndsAt: a.trialEndsAt ? new Date(a.trialEndsAt) : null,
            status: RelationStatus.ACTIVE,
          })),
        });
      }
    });

    return this.listCommittee(classId);
  }

  // --- Periods summary ---
  async getPeriodsSummary(classId: string, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const records = await prisma.scoreRecord.findMany({
      where: {
        classId,
        createdAt: { gte: fromDate, lte: toDate },
      },
      select: {
        studentId: true,
        delta: true,
        recordType: true,
      },
    });

    const totalDelta = records.reduce((sum, r) => sum + r.delta, 0);
    const totalRecords = records.length;

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      totalRecords,
      totalDelta,
    };
  }
}

export const scoresService = new ScoresService();
