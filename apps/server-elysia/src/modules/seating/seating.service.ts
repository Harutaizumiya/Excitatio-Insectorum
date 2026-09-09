import { SeatCellType, StudentStatus } from '@prisma/client';
import { prisma } from '../../plugins/prisma';
import { BusinessError } from '../../plugins/error-handler';
import { ClassEventType } from '../realtime/realtime.types';
import { realtimeService } from '../realtime/realtime.service';

export interface SeatLayoutSeatInput {
  rowIndex: number;
  colIndex: number;
  studentId?: string | null;
  cellType?: SeatCellType;
}

export interface SaveSeatLayoutInput {
  seats: SeatLayoutSeatInput[];
}

export class SeatingService {
  async getCurrentLayout(classId: string) {
    const classroom = await prisma.classroom.findUnique({
      where: { id: classId },
      select: {
        gridRows: true,
        gridCols: true,
        currentLayoutVersionId: true,
      },
    });

    if (!classroom) {
      throw new BusinessError('CLASSROOM_NOT_FOUND', '班级不存在', 404);
    }

    const current = classroom.currentLayoutVersionId
      ? await prisma.seatLayoutVersion.findUnique({
          where: { id: classroom.currentLayoutVersionId },
          select: {
            id: true,
            version: true,
            seats: {
              orderBy: [{ rowIndex: 'asc' }, { colIndex: 'asc' }],
              select: {
                id: true,
                rowIndex: true,
                colIndex: true,
                cellType: true,
                student: { select: { id: true, name: true } },
              },
            },
          },
        })
      : null;

    return {
      versionId: current?.id ?? null,
      version: current?.version ?? null,
      rows: classroom.gridRows,
      cols: classroom.gridCols,
      seats: (current?.seats ?? []).map((s) => ({
        id: s.id,
        row: s.rowIndex,
        col: s.colIndex,
        student: s.student,
        cellType: s.cellType,
      })),
    };
  }

  async saveLayout(classId: string, userId: string, dto: SaveSeatLayoutInput) {
    const classroom = await prisma.classroom.findUnique({
      where: { id: classId },
      select: { gridRows: true, gridCols: true },
    });
    if (!classroom) {
      throw new BusinessError('CLASSROOM_NOT_FOUND', '班级不存在', 404);
    }

    const studentIds = dto.seats
      .map((s) => s.studentId)
      .filter((id): id is string => Boolean(id));

    // Check bounds
    for (const seat of dto.seats) {
      if (
        seat.rowIndex < 0 ||
        seat.rowIndex >= classroom.gridRows ||
        seat.colIndex < 0 ||
        seat.colIndex >= classroom.gridCols
      ) {
        throw new BusinessError(
          'SEAT_POSITION_OUT_OF_BOUNDS',
          '座位坐标超出班级网格范围',
          400,
        );
      }
    }

    // Check duplicate positions
    const posKeys = new Set<string>();
    for (const seat of dto.seats) {
      const key = `${seat.rowIndex}:${seat.colIndex}`;
      if (posKeys.has(key)) {
        throw new BusinessError('DUPLICATE_SEAT_POSITION', '网格中存在重复位置的座位', 400);
      }
      posKeys.add(key);
    }

    // Check duplicate students
    const studentIdSet = new Set<string>();
    for (const id of studentIds) {
      if (studentIdSet.has(id)) {
        throw new BusinessError('DUPLICATE_STUDENT_IN_LAYOUT', '同一学生不能分配多个座位', 400);
      }
      studentIdSet.add(id);
    }

    // Validate students belong to class and are active
    if (studentIds.length > 0) {
      const validStudents = await prisma.student.findMany({
        where: {
          id: { in: studentIds },
          classId,
          deletedAt: null,
          status: StudentStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (validStudents.length !== studentIds.length) {
        throw new BusinessError('INVALID_STUDENT_IN_LAYOUT', '座位中包含非本班或非活跃学生', 400);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const latest = await tx.seatLayoutVersion.findFirst({
        where: { classId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const nextVersion = (latest?.version ?? 0) + 1;
      const layout = await tx.seatLayoutVersion.create({
        data: {
          classId,
          version: nextVersion,
          createdBy: userId,
        },
      });

      if (dto.seats.length > 0) {
        await tx.seat.createMany({
          data: dto.seats.map((seat) => ({
            layoutVersionId: layout.id,
            rowIndex: seat.rowIndex,
            colIndex: seat.colIndex,
            studentId: seat.studentId || null,
            cellType: seat.cellType || SeatCellType.SEAT,
          })),
        });
      }

      await tx.classroom.update({
        where: { id: classId },
        data: { currentLayoutVersionId: layout.id },
      });

      return { versionId: layout.id, version: nextVersion };
    });

    realtimeService.publishClassEvent(classId, {
      id: `${classId}-layout-${Date.now()}`,
      type: ClassEventType.SEAT_LAYOUT_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: { version: result.version },
    });

    return result;
  }

  async listVersions(classId: string, page = 1, pageSize = 20) {
    const p = Math.max(1, page);
    const ps = Math.min(100, Math.max(1, pageSize));

    const [versions, total] = await prisma.$transaction([
      prisma.seatLayoutVersion.findMany({
        where: { classId },
        orderBy: { version: 'desc' },
        skip: (p - 1) * ps,
        take: ps,
        select: {
          id: true,
          version: true,
          sourceVersionId: true,
          createdBy: true,
          createdAt: true,
        },
      }),
      prisma.seatLayoutVersion.count({ where: { classId } }),
    ]);

    return {
      data: versions.map((v) => ({
        versionId: v.id,
        version: v.version,
        sourceVersionId: v.sourceVersionId,
        createdBy: v.createdBy,
        createdAt: v.createdAt.toISOString(),
      })),
      meta: { page: p, pageSize: ps, total },
    };
  }

  async getVersion(classId: string, versionId: string) {
    const classroom = await prisma.classroom.findUnique({
      where: { id: classId },
      select: { gridRows: true, gridCols: true },
    });
    if (!classroom) {
      throw new BusinessError('CLASSROOM_NOT_FOUND', '班级不存在', 404);
    }

    const version = await prisma.seatLayoutVersion.findFirst({
      where: { id: versionId, classId },
      select: {
        id: true,
        version: true,
        seats: {
          orderBy: [{ rowIndex: 'asc' }, { colIndex: 'asc' }],
          select: {
            id: true,
            rowIndex: true,
            colIndex: true,
            cellType: true,
            student: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!version) {
      throw new BusinessError('SEAT_LAYOUT_VERSION_NOT_FOUND', '座位布局版本不存在', 404);
    }

    return {
      versionId: version.id,
      version: version.version,
      rows: classroom.gridRows,
      cols: classroom.gridCols,
      seats: version.seats.map((s) => ({
        id: s.id,
        row: s.rowIndex,
        col: s.colIndex,
        student: s.student,
        cellType: s.cellType,
      })),
    };
  }

  async restoreVersion(classId: string, versionId: string, userId: string) {
    const historical = await prisma.seatLayoutVersion.findFirst({
      where: { id: versionId, classId },
      include: {
        seats: true,
      },
    });
    if (!historical) {
      throw new BusinessError('SEAT_LAYOUT_VERSION_NOT_FOUND', '座位布局版本不存在', 404);
    }

    const result = await prisma.$transaction(async (tx) => {
      const latest = await tx.seatLayoutVersion.findFirst({
        where: { classId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const nextVersion = (latest?.version ?? 0) + 1;
      const newLayout = await tx.seatLayoutVersion.create({
        data: {
          classId,
          version: nextVersion,
          sourceVersionId: versionId,
          createdBy: userId,
        },
      });

      if (historical.seats.length > 0) {
        await tx.seat.createMany({
          data: historical.seats.map((seat) => ({
            layoutVersionId: newLayout.id,
            rowIndex: seat.rowIndex,
            colIndex: seat.colIndex,
            studentId: seat.studentId,
            cellType: seat.cellType,
          })),
        });
      }

      await tx.classroom.update({
        where: { id: classId },
        data: { currentLayoutVersionId: newLayout.id },
      });

      return {
        versionId: newLayout.id,
        version: nextVersion,
        sourceVersionId: versionId,
      };
    });

    realtimeService.publishClassEvent(classId, {
      id: `${classId}-layout-${Date.now()}`,
      type: ClassEventType.SEAT_LAYOUT_CHANGED,
      classId,
      occurredAt: new Date().toISOString(),
      payload: { version: result.version },
    });

    return result;
  }
}

export const seatingService = new SeatingService();
