import { Elysia, t } from 'elysia';
import { randomInt, randomUUID } from 'node:crypto';
import { StudentStatus } from '@prisma/client';
import { prisma } from '../../plugins/prisma';
import { authPlugin } from '../../plugins/auth';
import { BusinessError } from '../../plugins/error-handler';
import { ClassEventType } from '../realtime/realtime.types';
import { realtimeService } from '../realtime/realtime.service';
import { studentsService } from '../students/students.service';

const RANDOM_PICK_DISPLAY_DURATION_MS = 8_000;

export const randomPickController = new Elysia({ prefix: '/classes/:classId/random-pick' })
  .use(authPlugin)
  .post(
    '',
    async ({ user, params: { classId }, body }) => {
      await studentsService.assertAccess(user!.sub, classId);

      const excludeIds = body?.excludeStudentIds ?? [];
      const uniqueExclusions = [...new Set(excludeIds)];

      const candidates = await prisma.student.findMany({
        where: {
          classId,
          status: StudentStatus.ACTIVE,
          deletedAt: null,
          ...(uniqueExclusions.length > 0 ? { id: { notIn: uniqueExclusions } } : {}),
        },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      });

      if (candidates.length === 0) {
        throw new BusinessError('RANDOM_PICK_NO_CANDIDATES', '没有可供随机点名的在班学生', 409);
      }

      const student = candidates[randomInt(candidates.length)]!;

      realtimeService.publishClassEvent(classId, {
        id: randomUUID(),
        type: ClassEventType.RANDOM_PICKED,
        classId,
        occurredAt: new Date().toISOString(),
        payload: {
          studentId: student.id,
          name: student.name,
          displayDurationMs: RANDOM_PICK_DISPLAY_DURATION_MS,
        },
      });

      return { data: { student } };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      body: t.Optional(
        t.Object({
          excludeStudentIds: t.Optional(t.Array(t.String())),
        }),
      ),
      detail: { summary: '课堂随机点名抽查', tags: ['Random Pick'] },
    },
  );
