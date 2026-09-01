import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RelationStatus, TeacherRole } from '@prisma/client';
import { BusinessException, ClassEventType } from '../common';
import { ClassroomsService } from '../classrooms';
import { PrismaService } from '../prisma';
import { RealtimeService } from '../realtime';
import { type SaveScheduleDto, SCHEDULE_TIME_PATTERN } from './dto';

const MAX_PERIODS = 12;

type ScheduleRead = {
  activeTemplateId: string | null;
  templates: Array<{
    id: string;
    name: string;
    periods: Array<{ periodNo: number; startTime: string; endTime: string }>;
  }>;
  entries: Array<{
    weekday: number;
    periodNo: number;
    courseName: string;
    classTeacherId: string | null;
    teacher: { id: string; name: string } | null;
  }>;
};

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classrooms: ClassroomsService,
    private readonly realtime: RealtimeService,
  ) {}

  async get(classId: string): Promise<ScheduleRead> {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId },
      select: {
        activeScheduleTemplateId: true,
        scheduleTemplates: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            name: true,
            periods: {
              orderBy: { periodNo: 'asc' },
              select: { periodNo: true, startTime: true, endTime: true },
            },
          },
        },
        scheduleEntries: {
          orderBy: [{ weekday: 'asc' }, { periodNo: 'asc' }],
          select: {
            weekday: true,
            periodNo: true,
            courseName: true,
            classTeacher: {
              select: { id: true, teacher: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    if (!classroom) {
      throw new BusinessException('CLASSROOM_NOT_FOUND', '班级不存在', HttpStatus.NOT_FOUND);
    }

    return {
      activeTemplateId: classroom.activeScheduleTemplateId,
      templates: classroom.scheduleTemplates,
      entries: classroom.scheduleEntries.map((entry) => ({
        weekday: entry.weekday,
        periodNo: entry.periodNo,
        courseName: entry.courseName,
        classTeacherId: entry.classTeacher?.id ?? null,
        teacher: entry.classTeacher?.teacher ?? null,
      })),
    };
  }

  async save(userId: string, classId: string, dto: SaveScheduleDto): Promise<ScheduleRead> {
    await this.classrooms.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    const normalized = this.validateInput(dto);

    const activeTemplateId = await this.prisma.$transaction(async (tx) => {
      const classroom = await tx.classroom.findUnique({
        where: { id: classId },
        select: { id: true },
      });
      if (!classroom) {
        throw new BusinessException('CLASSROOM_NOT_FOUND', '班级不存在', HttpStatus.NOT_FOUND);
      }

      const existingTemplates = await tx.scheduleTemplate.findMany({
        where: { classId },
        select: { id: true },
      });
      const existingTemplateIds = new Set(existingTemplates.map((template) => template.id));
      const incomingTemplateIds = normalized.templates
        .map((template) => template.id)
        .filter((id): id is string => id !== undefined);
      if (incomingTemplateIds.length !== new Set(incomingTemplateIds).size) {
        throw new BusinessException('SCHEDULE_TEMPLATE_DUPLICATED', '作息模板重复');
      }

      for (const id of incomingTemplateIds) {
        if (!existingTemplateIds.has(id)) {
          throw new BusinessException(
            'SCHEDULE_TEMPLATE_NOT_FOUND',
            '作息模板不存在',
            HttpStatus.NOT_FOUND,
          );
        }
      }

      await tx.scheduleTemplate.deleteMany({
        where: {
          classId,
          ...(incomingTemplateIds.length ? { id: { notIn: incomingTemplateIds } } : {}),
        },
      });

      const templateIdByKey = new Map<string, string>();
      for (const template of normalized.templates) {
        const saved = template.id
          ? await tx.scheduleTemplate.update({
              where: { id: template.id },
              data: { name: template.name },
              select: { id: true },
            })
          : await tx.scheduleTemplate.create({
              data: { classId, name: template.name },
              select: { id: true },
            });

        await tx.scheduleTemplatePeriod.deleteMany({ where: { templateId: saved.id } });
        await tx.scheduleTemplatePeriod.createMany({
          data: template.periods.map((period) => ({
            templateId: saved.id,
            periodNo: period.periodNo,
            startTime: period.startTime,
            endTime: period.endTime,
          })),
        });
        templateIdByKey.set(template.clientKey, saved.id);
      }

      const nextActiveTemplateId = templateIdByKey.get(normalized.activeTemplateKey);
      if (!nextActiveTemplateId) {
        throw new BusinessException(
          'SCHEDULE_ACTIVE_TEMPLATE_REQUIRED',
          '当前作息模板不存在',
          HttpStatus.BAD_REQUEST,
        );
      }

      const teacherIds = new Set(
        (
          await tx.classTeacher.findMany({
            where: { classId, status: RelationStatus.ACTIVE },
            select: { id: true },
          })
        ).map((teacher) => teacher.id),
      );
      for (const entry of normalized.entries) {
        if (entry.classTeacherId !== null && !teacherIds.has(entry.classTeacherId)) {
          throw new BusinessException(
            'SCHEDULE_TEACHER_NOT_FOUND',
            '任课教师不存在或已停用',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      await tx.scheduleEntry.deleteMany({ where: { classId } });
      if (normalized.entries.length > 0) {
        await tx.scheduleEntry.createMany({
          data: normalized.entries.map((entry) => ({
            classId,
            weekday: entry.weekday,
            periodNo: entry.periodNo,
            courseName: entry.courseName,
            classTeacherId: entry.classTeacherId,
          })),
        });
      }

      await tx.classroom.update({
        where: { id: classId },
        data: { activeScheduleTemplateId: nextActiveTemplateId },
      });
      return nextActiveTemplateId;
    });

    await this.publishChanged(classId, activeTemplateId);
    return this.get(classId);
  }

  async getForDisplay(classId: string): Promise<{
    periods: Array<{ periodNo: number; startTime: string; endTime: string }>;
    entries: Array<{ weekday: number; periodNo: number; courseName: string }>;
  }> {
    const schedule = await this.get(classId);
    const activeTemplate = schedule.templates.find(
      (template) => template.id === schedule.activeTemplateId,
    );
    return {
      periods: activeTemplate?.periods ?? [],
      entries: schedule.entries.map(({ weekday, periodNo, courseName }) => ({
        weekday,
        periodNo,
        courseName,
      })),
    };
  }

  private validateInput(dto: SaveScheduleDto): {
    activeTemplateKey: string;
    templates: Array<{
      clientKey: string;
      id?: string;
      name: string;
      periods: Array<{ periodNo: number; startTime: string; endTime: string }>;
    }>;
    entries: Array<{
      weekday: number;
      periodNo: number;
      courseName: string;
      classTeacherId: string | null;
    }>;
  } {
    if (dto.templates.length === 0) {
      throw new BusinessException('SCHEDULE_TEMPLATE_REQUIRED', '至少保留一套作息模板');
    }
    const templateKeys = new Set<string>();
    const templateNames = new Set<string>();
    let periodNos: number[] | null = null;

    const templates = dto.templates.map((template) => {
      const clientKey = template.clientKey.trim();
      const name = template.name.trim();
      if (!clientKey || templateKeys.has(clientKey)) {
        throw new BusinessException('SCHEDULE_TEMPLATE_KEY_INVALID', '作息模板标识无效');
      }
      if (!name || templateNames.has(name)) {
        throw new BusinessException('SCHEDULE_TEMPLATE_NAME_INVALID', '作息模板名称重复或为空');
      }
      templateKeys.add(clientKey);
      templateNames.add(name);

      const seenPeriodNos = new Set<number>();
      const periods = [...template.periods]
        .sort((left, right) => left.periodNo - right.periodNo)
        .map((period) => {
          if (seenPeriodNos.has(period.periodNo)) {
            throw new BusinessException('SCHEDULE_PERIOD_DUPLICATED', '作息节次重复');
          }
          seenPeriodNos.add(period.periodNo);
          this.validateTime(period.startTime, period.endTime);
          return {
            periodNo: period.periodNo,
            startTime: period.startTime,
            endTime: period.endTime,
          };
        });

      if (periods.length === 0) {
        throw new BusinessException('SCHEDULE_PERIOD_REQUIRED', '至少保留一个节次');
      }
      if (periods.length > MAX_PERIODS) {
        throw new BusinessException('SCHEDULE_PERIOD_LIMIT_EXCEEDED', '作息节次不能超过 12 节');
      }
      for (let index = 0; index < periods.length; index += 1) {
        if (periods[index].periodNo !== index + 1) {
          throw new BusinessException('SCHEDULE_PERIOD_SET_INVALID', '作息节次必须从 1 连续编号');
        }
        if (index > 0 && periods[index - 1].endTime > periods[index].startTime) {
          throw new BusinessException('SCHEDULE_TIME_OVERLAP', '作息时间不能重叠');
        }
      }

      const currentPeriodNos = periods.map((period) => period.periodNo);
      if (
        periodNos !== null &&
        (periodNos.length !== currentPeriodNos.length ||
          periodNos.some((periodNo, index) => periodNo !== currentPeriodNos[index]))
      ) {
        throw new BusinessException('SCHEDULE_PERIOD_SET_MISMATCH', '所有作息模板必须使用相同节次');
      }
      periodNos = currentPeriodNos;

      return {
        clientKey,
        id: template.id?.trim() || undefined,
        name,
        periods,
      };
    });

    if (!templateKeys.has(dto.activeTemplateKey.trim())) {
      throw new BusinessException(
        'SCHEDULE_ACTIVE_TEMPLATE_REQUIRED',
        '当前作息模板不存在',
        HttpStatus.BAD_REQUEST,
      );
    }

    const allowedPeriodNos = new Set<number>(periodNos ?? []);
    const entryKeys = new Set<string>();
    const entries = dto.entries.map((entry) => {
      const courseName = entry.courseName.trim();
      const entryKey = `${entry.weekday}-${entry.periodNo}`;
      if (!Number.isInteger(entry.weekday) || entry.weekday < 1 || entry.weekday > 7) {
        throw new BusinessException('SCHEDULE_WEEKDAY_INVALID', '星期无效');
      }
      if (!courseName) {
        throw new BusinessException('SCHEDULE_COURSE_NAME_REQUIRED', '课程名称不能为空');
      }
      if (!allowedPeriodNos.has(entry.periodNo)) {
        throw new BusinessException('SCHEDULE_PERIOD_NOT_FOUND', '课表节次不存在');
      }
      if (entryKeys.has(entryKey)) {
        throw new BusinessException('SCHEDULE_ENTRY_DUPLICATED', '课表课程格子重复');
      }
      entryKeys.add(entryKey);
      return {
        weekday: entry.weekday,
        periodNo: entry.periodNo,
        courseName,
        classTeacherId: entry.classTeacherId?.trim() || null,
      };
    });

    return {
      activeTemplateKey: dto.activeTemplateKey.trim(),
      templates,
      entries,
    };
  }

  private validateTime(startTime: string, endTime: string): void {
    if (!SCHEDULE_TIME_PATTERN.test(startTime) || !SCHEDULE_TIME_PATTERN.test(endTime)) {
      throw new BusinessException('SCHEDULE_TIME_INVALID', '上下课时间格式无效');
    }
    if (this.timeToMinutes(startTime) >= this.timeToMinutes(endTime)) {
      throw new BusinessException('SCHEDULE_TIME_RANGE_INVALID', '上课时间必须早于下课时间');
    }
  }

  private timeToMinutes(value: string): number {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }

  private async publishChanged(classId: string, activeTemplateId: string): Promise<void> {
    try {
      await Promise.resolve(
        this.realtime.publishClassEvent(classId, {
          id: randomUUID(),
          type: ClassEventType.SCHEDULE_CHANGED,
          classId,
          occurredAt: new Date().toISOString(),
          payload: { activeTemplateId },
        }),
      );
    } catch (error) {
      this.logger.error(`Realtime publication failed after schedule commit: ${String(error)}`);
    }
  }
}
