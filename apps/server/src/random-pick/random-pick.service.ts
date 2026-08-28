import { randomInt, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { BusinessException, ClassEventType } from '../common';
import { PrismaService } from '../prisma';
import { RealtimeService } from '../realtime';

const RANDOM_PICK_DISPLAY_DURATION_MS = 8_000;

@Injectable()
export class RandomPickService {
  private readonly logger = new Logger(RandomPickService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async pick(
    classId: string,
    excludeStudentIds: readonly string[] = [],
  ): Promise<{ student: { id: string; name: string } }> {
    const uniqueExclusions = [...new Set(excludeStudentIds)];
    const candidates = await this.prisma.student.findMany({
      where: {
        classId,
        status: StudentStatus.ACTIVE,
        ...(uniqueExclusions.length > 0 ? { id: { notIn: uniqueExclusions } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    if (candidates.length === 0) {
      throw new BusinessException(
        'RANDOM_PICK_NO_CANDIDATES',
        '没有可供随机点名的在班学生',
        HttpStatus.CONFLICT,
      );
    }

    const student = candidates[randomInt(candidates.length)];
    try {
      this.realtime.publishClassEvent(classId, {
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
    } catch (error) {
      const message = error instanceof Error ? error.stack : String(error);
      this.logger.error('Random pick succeeded but realtime publication failed', message);
    }

    return { student };
  }
}
