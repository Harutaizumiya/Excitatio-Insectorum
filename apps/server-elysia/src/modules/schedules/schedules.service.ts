import { prisma } from '../../plugins/prisma';
import { BusinessError } from '../../plugins/error-handler';
import { ClassEventType } from '../realtime/realtime.types';
import { realtimeService } from '../realtime/realtime.service';

export interface SchedulePeriodInput {
  periodNo: number;
  startTime: string;
  endTime: string;
}

export interface ScheduleTemplateInput {
  clientKey: string;
  id?: string;
  name: string;
  periods: SchedulePeriodInput[];
}

export interface ScheduleEntryInput {
  weekday: number;
  periodNo: number;
  courseName: string;
  classTeacherId?: string | null;
}

export interface SaveScheduleInput {
  activeTemplateKey: string;
  templates: ScheduleTemplateInput[];
  entries: ScheduleEntryInput[];
}

export class SchedulesService {
  async get(classId: string) {
    const classroom = await prisma.classroom.findUnique({
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
      throw new BusinessError('CLASSROOM_NOT_FOUND', '班级不存在', 404);
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

  async save(userId: string, classId: string, dto: SaveScheduleInput) {
    const classroom = await prisma.classroom.findUnique({ where: { id: classId } });
    if (!classroom) {
      throw new BusinessError('CLASSROOM_NOT_FOUND', '班级不存在', 404);
    }

    const saved = await prisma.$transaction(async (tx) => {
      const classTeacherIds = [
        ...new Set(
          dto.entries
            .map((entry) => entry.classTeacherId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (classTeacherIds.length > 0) {
        const classTeachers = await tx.classTeacher.findMany({
          where: { classId, id: { in: classTeacherIds } },
          select: { id: true },
        });
        if (classTeachers.length !== classTeacherIds.length) {
          throw new BusinessError(
            'INVALID_CLASS_TEACHER',
            '课表中包含不属于当前班级的教师关系',
            400,
          );
        }
      }

      // Clean old entries & templates
      await tx.scheduleEntry.deleteMany({ where: { classId } });
      await tx.scheduleTemplatePeriod.deleteMany({
        where: { template: { classId } },
      });
      await tx.scheduleTemplate.deleteMany({ where: { classId } });

      // Create templates & periods
      const templateIdMap = new Map<string, string>();
      for (const tpl of dto.templates) {
        const created = await tx.scheduleTemplate.create({
          data: {
            classId,
            name: tpl.name,
            periods: {
              create: tpl.periods.map((p) => ({
                periodNo: p.periodNo,
                startTime: p.startTime,
                endTime: p.endTime,
              })),
            },
          },
        });
        templateIdMap.set(tpl.clientKey, created.id);
        if (tpl.id) templateIdMap.set(tpl.id, created.id);
      }

      let activeTemplateId: string | null = null;
      activeTemplateId = templateIdMap.get(dto.activeTemplateKey) || dto.activeTemplateKey;

      await tx.classroom.update({
        where: { id: classId },
        data: { activeScheduleTemplateId: activeTemplateId },
      });

      // Create entries
      if (dto.entries.length > 0) {
        await tx.scheduleEntry.createMany({
          data: dto.entries.map((e) => ({
            classId,
            weekday: e.weekday,
            periodNo: e.periodNo,
            courseName: e.courseName,
            classTeacherId: e.classTeacherId || null,
          })),
        });
      }

      return activeTemplateId;
    });

    realtimeService.publishClassEvent(classId, {
      id: `${classId}-schedule-${Date.now()}`,
      type: ClassEventType.SCHEDULE_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: { activeTemplateId: saved },
    });

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
}

export const schedulesService = new SchedulesService();
