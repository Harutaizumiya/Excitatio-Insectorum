import { HttpStatus, Injectable } from '@nestjs/common';
import { RelationStatus, TeacherRole } from '@prisma/client';
import { BusinessException } from '../common';
import { PrismaService } from '../prisma';
import type { CreateScoreRuleDto, ListScoreRulesQueryDto, UpdateScoreRuleDto } from './dto';

@Injectable()
export class ScoreRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(classId: string, query: ListScoreRulesQueryDto) {
    return this.prisma.scoreRule.findMany({
      where: {
        classId,
        enabled: query.enabled,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async create(classId: string, operatorId: string, dto: CreateScoreRuleDto) {
    this.assertNonZeroDelta(dto.delta);
    const name = this.normalizeName(dto.name);
    const group = dto.group === undefined ? undefined : this.normalizeGroup(dto.group);

    return this.prisma.$transaction(async (tx) => {
      await this.assertHeadTeacher(tx, classId, operatorId);
      return tx.scoreRule.create({
        data: {
          classId,
          name,
          group,
          delta: dto.delta,
          description: dto.description ?? null,
          createdBy: operatorId,
        },
      });
    });
  }

  async update(classId: string, ruleId: string, operatorId: string, dto: UpdateScoreRuleDto) {
    if (dto.delta !== undefined) this.assertNonZeroDelta(dto.delta);
    const name = dto.name === undefined ? undefined : this.normalizeName(dto.name);
    const group = dto.group === undefined ? undefined : this.normalizeGroup(dto.group);

    return this.prisma.$transaction(async (tx) => {
      await this.assertHeadTeacher(tx, classId, operatorId);
      const existing = await tx.scoreRule.findFirst({
        where: { id: ruleId, classId },
        select: { id: true },
      });
      if (!existing) {
        throw new BusinessException('SCORE_RULE_NOT_FOUND', '积分规则不存在', HttpStatus.NOT_FOUND);
      }

      return tx.scoreRule.update({
        where: { id: ruleId },
        data: {
          name,
          group,
          delta: dto.delta,
          description: dto.description,
          enabled: dto.enabled,
        },
      });
    });
  }

  async disable(classId: string, ruleId: string, operatorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertHeadTeacher(tx, classId, operatorId);
      const existing = await tx.scoreRule.findFirst({
        where: { id: ruleId, classId },
        select: { id: true },
      });
      if (!existing) {
        throw new BusinessException('SCORE_RULE_NOT_FOUND', '积分规则不存在', HttpStatus.NOT_FOUND);
      }

      return tx.scoreRule.update({
        where: { id: ruleId },
        data: { enabled: false },
      });
    });
  }

  private assertNonZeroDelta(delta: number): void {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new BusinessException('INVALID_SCORE_DELTA', '积分值必须为非 0 整数');
    }
  }

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (!normalized) {
      throw new BusinessException('INVALID_SCORE_RULE_NAME', '积分规则名称不能为空');
    }
    return normalized;
  }

  private normalizeGroup(group: string): string {
    const normalized = group.trim();
    if (!normalized) {
      throw new BusinessException('INVALID_SCORE_RULE_GROUP', '积分规则分组不能为空');
    }
    return normalized;
  }

  private async assertHeadTeacher(
    tx: Pick<PrismaService, 'classTeacher'>,
    classId: string,
    operatorId: string,
  ): Promise<void> {
    const relation = await tx.classTeacher.findFirst({
      where: {
        classId,
        teacherId: operatorId,
        status: RelationStatus.ACTIVE,
        role: TeacherRole.HEAD_TEACHER,
      },
      select: { id: true },
    });
    if (!relation) {
      throw new BusinessException('FORBIDDEN_ROLE', '仅班主任可管理积分规则', HttpStatus.FORBIDDEN);
    }
  }
}
