import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, SeatCellType, StudentStatus } from '@prisma/client';
import {
  CLASS_REALTIME_PUBLISHER,
  ClassEventType,
  type ClassRealtimePublisher,
} from '../common/realtime/class-realtime-event';
import { BusinessException } from '../common/exceptions/business.exception';
import { PrismaService } from '../prisma';
import {
  SaveSeatLayoutDto,
  seatCellTypeValues,
  SeatLayoutSeatDto,
  SeatLayoutVersionsQueryDto,
} from './dto/seat-layout.dto';

const MAX_VERSION_WRITE_ATTEMPTS = 3;

interface StoredSeatEntry {
  rowIndex: number;
  colIndex: number;
  studentId: string | null;
  cellType: SeatCellType;
}

interface SeatWithStudent {
  id: string;
  rowIndex: number;
  colIndex: number;
  student: { id: string; name: string } | null;
  cellType: SeatCellType;
}

export interface SeatLayoutView {
  versionId: string | null;
  version: number | null;
  rows: number;
  cols: number;
  seats: Array<{
    id: string;
    row: number;
    col: number;
    student: { id: string; name: string } | null;
    cellType: string;
  }>;
}

export interface SeatLayoutMutationResult {
  versionId: string;
  version: number;
}

export interface SeatLayoutRestoreResult extends SeatLayoutMutationResult {
  sourceVersionId: string;
}

export interface SeatLayoutVersionListItem {
  versionId: string;
  version: number;
  sourceVersionId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface PaginatedSeatLayoutVersions {
  data: SeatLayoutVersionListItem[];
  meta: { page: number; pageSize: number; total: number };
}

interface SnapshotResult {
  versionId: string;
  version: number;
  sourceVersionId: string | null;
}

@Injectable()
export class SeatingService {
  private readonly logger = new Logger(SeatingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(CLASS_REALTIME_PUBLISHER)
    private readonly realtimePublisher?: ClassRealtimePublisher,
  ) {}

  async getCurrentLayout(classId: string): Promise<SeatLayoutView> {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId },
      select: {
        gridRows: true,
        gridCols: true,
        currentLayoutVersionId: true,
      },
    });

    if (!classroom) {
      this.throwClassNotFound();
    }

    const current = classroom.currentLayoutVersionId
      ? await this.prisma.seatLayoutVersion.findUnique({
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
    return this.toLayoutView(
      current?.id ?? null,
      current?.version ?? null,
      classroom.gridRows,
      classroom.gridCols,
      current?.seats ?? [],
    );
  }

  async saveLayout(
    classId: string,
    createdBy: string,
    dto: SaveSeatLayoutDto,
  ): Promise<SeatLayoutMutationResult> {
    this.validateBaseVersion(dto.baseVersion);
    const entries = this.normalizeSeatEntries(dto.seats ?? []);

    const snapshot = await this.withVersionWriteRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const classroom = await tx.classroom.findUnique({
            where: { id: classId },
            select: {
              gridRows: true,
              gridCols: true,
              currentLayoutVersionId: true,
            },
          });

          if (!classroom) {
            this.throwClassNotFound();
          }

          this.validateSeatEntries(entries, classroom.gridRows, classroom.gridCols);
          await this.assertActiveStudents(tx, classId, entries);

          const currentVersion = classroom.currentLayoutVersionId
            ? ((
                await tx.seatLayoutVersion.findUnique({
                  where: { id: classroom.currentLayoutVersionId },
                  select: { version: true },
                })
              )?.version ?? 0)
            : 0;
          if (dto.baseVersion !== undefined && dto.baseVersion !== currentVersion) {
            this.throwVersionConflict();
          }

          return this.createAndActivateSnapshot(tx, {
            classId,
            createdBy,
            currentLayoutVersionId: classroom.currentLayoutVersionId,
            entries,
            sourceVersionId: null,
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      ),
    );

    await this.publishLayoutChanged(classId, snapshot.version);
    return { versionId: snapshot.versionId, version: snapshot.version };
  }

  async listVersions(
    classId: string,
    query: SeatLayoutVersionsQueryDto,
  ): Promise<PaginatedSeatLayoutVersions> {
    await this.assertClassExists(classId);
    const page = this.normalizePositiveInteger(query.page, 1, 'page');
    const pageSize = this.normalizePositiveInteger(query.pageSize, 20, 'pageSize');

    const [total, versions] = await this.prisma.$transaction([
      this.prisma.seatLayoutVersion.count({ where: { classId } }),
      this.prisma.seatLayoutVersion.findMany({
        where: { classId },
        orderBy: { version: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          version: true,
          sourceVersionId: true,
          createdBy: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      data: versions.map((version) => ({
        versionId: version.id,
        version: version.version,
        sourceVersionId: version.sourceVersionId,
        createdBy: version.createdBy,
        createdAt: version.createdAt.toISOString(),
      })),
      meta: { page, pageSize, total },
    };
  }

  async getVersion(classId: string, versionId: string): Promise<SeatLayoutView> {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId },
      select: { gridRows: true, gridCols: true },
    });
    if (!classroom) {
      this.throwClassNotFound();
    }

    const version = await this.prisma.seatLayoutVersion.findFirst({
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
      this.throwVersionNotFound();
    }

    return this.toLayoutView(
      version.id,
      version.version,
      classroom.gridRows,
      classroom.gridCols,
      version.seats,
    );
  }

  async restoreVersion(
    classId: string,
    versionId: string,
    createdBy: string,
  ): Promise<SeatLayoutRestoreResult> {
    const snapshot = await this.withVersionWriteRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const classroom = await tx.classroom.findUnique({
            where: { id: classId },
            select: {
              gridRows: true,
              gridCols: true,
              currentLayoutVersionId: true,
            },
          });
          if (!classroom) {
            this.throwClassNotFound();
          }

          const source = await tx.seatLayoutVersion.findFirst({
            where: { id: versionId, classId },
            select: {
              id: true,
              seats: {
                orderBy: [{ rowIndex: 'asc' }, { colIndex: 'asc' }],
                select: { rowIndex: true, colIndex: true, studentId: true, cellType: true },
              },
            },
          });
          if (!source) {
            this.throwVersionNotFound();
          }

          const sourceEntries = source.seats.map((seat) => ({
            rowIndex: seat.rowIndex,
            colIndex: seat.colIndex,
            studentId: seat.studentId,
            cellType: seat.cellType ?? SeatCellType.SEAT,
          }));
          this.validateSeatEntries(sourceEntries, classroom.gridRows, classroom.gridCols);
          const entries = await this.clearInactiveStudents(tx, classId, sourceEntries);

          return this.createAndActivateSnapshot(tx, {
            classId,
            createdBy,
            currentLayoutVersionId: classroom.currentLayoutVersionId,
            entries,
            sourceVersionId: source.id,
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      ),
    );

    await this.publishLayoutChanged(classId, snapshot.version);
    return {
      versionId: snapshot.versionId,
      version: snapshot.version,
      sourceVersionId: snapshot.sourceVersionId as string,
    };
  }

  private async createAndActivateSnapshot(
    tx: Prisma.TransactionClient,
    input: {
      classId: string;
      createdBy: string;
      currentLayoutVersionId: string | null;
      entries: readonly StoredSeatEntry[];
      sourceVersionId: string | null;
    },
  ): Promise<SnapshotResult> {
    const latest = await tx.seatLayoutVersion.findFirst({
      where: { classId: input.classId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    const created = await tx.seatLayoutVersion.create({
      data: {
        classId: input.classId,
        version: nextVersion,
        sourceVersionId: input.sourceVersionId,
        createdBy: input.createdBy,
      },
      select: { id: true, version: true },
    });

    if (input.entries.length > 0) {
      await tx.seat.createMany({
        data: input.entries.map((entry) => ({
          layoutVersionId: created.id,
          rowIndex: entry.rowIndex,
          colIndex: entry.colIndex,
          studentId: entry.studentId,
          cellType: entry.cellType,
        })),
      });
    }

    const activated = await tx.classroom.updateMany({
      where: {
        id: input.classId,
        currentLayoutVersionId: input.currentLayoutVersionId,
      },
      data: { currentLayoutVersionId: created.id },
    });
    if (activated.count !== 1) {
      this.throwVersionConflict();
    }

    return {
      versionId: created.id,
      version: created.version,
      sourceVersionId: input.sourceVersionId,
    };
  }

  private async assertActiveStudents(
    tx: Prisma.TransactionClient,
    classId: string,
    entries: readonly StoredSeatEntry[],
  ): Promise<void> {
    const studentIds = [
      ...new Set(entries.flatMap((entry) => (entry.studentId ? [entry.studentId] : []))),
    ];
    if (studentIds.length === 0) {
      return;
    }

    const activeStudents = await tx.student.findMany({
      where: { id: { in: studentIds }, classId, status: StudentStatus.ACTIVE },
      select: { id: true },
    });
    if (activeStudents.length !== studentIds.length) {
      throw new BusinessException(
        'SEAT_LAYOUT_STUDENT_INVALID',
        '座位中的学生必须属于本班且处于 ACTIVE 状态',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async clearInactiveStudents(
    tx: Prisma.TransactionClient,
    classId: string,
    entries: readonly StoredSeatEntry[],
  ): Promise<StoredSeatEntry[]> {
    const studentIds = [
      ...new Set(entries.flatMap((entry) => (entry.studentId ? [entry.studentId] : []))),
    ];
    if (studentIds.length === 0) return [...entries];

    const activeStudents = await tx.student.findMany({
      where: { id: { in: studentIds }, classId, status: StudentStatus.ACTIVE },
      select: { id: true },
    });
    const activeIds = new Set(activeStudents.map((student) => student.id));
    return entries.map((entry) => ({
      ...entry,
      studentId: entry.studentId && activeIds.has(entry.studentId) ? entry.studentId : null,
    }));
  }

  private normalizeSeatEntries(seats: readonly SeatLayoutSeatDto[]): StoredSeatEntry[] {
    return seats.map((seat) => ({
      rowIndex: seat.row,
      colIndex: seat.col,
      cellType: seat.cellType ? this.toPersistenceCellType(seat.cellType) : SeatCellType.SEAT,
      studentId: seat.cellType && seat.cellType !== seatCellTypeValues[0] ? null : seat.studentId ?? null,
    }));
  }

  private toPersistenceCellType(value: (typeof seatCellTypeValues)[number]): SeatCellType {
    return {
      seat: SeatCellType.SEAT,
      aisle: SeatCellType.AISLE,
      podium: SeatCellType.PODIUM,
      empty: SeatCellType.EMPTY,
    }[value];
  }

  private validateSeatEntries(
    entries: readonly StoredSeatEntry[],
    rows: number,
    cols: number,
  ): void {
    const cells = new Set<string>();
    const students = new Set<string>();

    for (const entry of entries) {
      if (
        !Number.isInteger(entry.rowIndex) ||
        !Number.isInteger(entry.colIndex) ||
        entry.rowIndex < 0 ||
        entry.colIndex < 0 ||
        entry.rowIndex >= rows ||
        entry.colIndex >= cols
      ) {
        throw new BusinessException(
          'SEAT_LAYOUT_COORDINATE_OUT_OF_BOUNDS',
          '座位坐标必须是网格内的 0-based 坐标',
          HttpStatus.BAD_REQUEST,
        );
      }

      const cell = `${entry.rowIndex}:${entry.colIndex}`;
      if (cells.has(cell)) {
        throw new BusinessException(
          'SEAT_LAYOUT_CELL_DUPLICATE',
          '同一网格单元不能存在多个座位',
          HttpStatus.BAD_REQUEST,
        );
      }
      cells.add(cell);

      if (entry.studentId !== null) {
        if (entry.cellType !== SeatCellType.SEAT) {
          throw new BusinessException(
            'SEAT_LAYOUT_STUDENT_INVALID',
            '只有普通座位可以安排学生',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (typeof entry.studentId !== 'string' || entry.studentId.trim().length === 0) {
          throw new BusinessException(
            'SEAT_LAYOUT_STUDENT_INVALID',
            'studentId 必须是非空字符串或 null',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (students.has(entry.studentId)) {
          throw new BusinessException(
            'SEAT_LAYOUT_STUDENT_DUPLICATE',
            '同一学生不能出现在多个座位',
            HttpStatus.BAD_REQUEST,
          );
        }
        students.add(entry.studentId);
      }
    }
  }

  private async assertClassExists(classId: string): Promise<void> {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId },
      select: { id: true },
    });
    if (!classroom) {
      this.throwClassNotFound();
    }
  }

  private validateBaseVersion(baseVersion: number | undefined): void {
    if (baseVersion !== undefined && (!Number.isInteger(baseVersion) || baseVersion < 0)) {
      throw new BusinessException('SEAT_LAYOUT_BASE_VERSION_INVALID', 'baseVersion 必须是非负整数');
    }
  }

  private normalizePositiveInteger(
    value: number | undefined,
    fallback: number,
    name: string,
  ): number {
    const normalized = value ?? fallback;
    if (!Number.isInteger(normalized) || normalized < 1) {
      throw new BusinessException('SEAT_LAYOUT_PAGINATION_INVALID', `${name} 必须是正整数`);
    }
    return normalized;
  }

  private toLayoutView(
    versionId: string | null,
    version: number | null,
    rows: number,
    cols: number,
    seats: readonly SeatWithStudent[],
  ): SeatLayoutView {
    return {
      versionId,
      version,
      rows,
      cols,
      seats: seats.map((seat) => ({
        id: seat.id,
        row: seat.rowIndex,
        col: seat.colIndex,
        cellType: seat.cellType?.toLowerCase() ?? "seat",
        student: seat.student ? { id: seat.student.id, name: seat.student.name } : null,
      })),
    };
  }

  private async publishLayoutChanged(classId: string, version: number): Promise<void> {
    if (!this.realtimePublisher) {
      return;
    }

    try {
      await this.realtimePublisher.publishClassEvent(classId, {
        id: randomUUID(),
        type: ClassEventType.SEAT_LAYOUT_CHANGED,
        classId,
        occurredAt: new Date().toISOString(),
        payload: { version },
      });
    } catch (error) {
      this.logger.error(`Realtime publication failed after seat layout commit: ${String(error)}`);
    }
  }

  private async withVersionWriteRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_VERSION_WRITE_ATTEMPTS; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isRetryableVersionConflict(error) || attempt === MAX_VERSION_WRITE_ATTEMPTS) {
          if (this.isRetryableVersionConflict(error)) {
            this.throwVersionConflict();
          }
          throw error;
        }
      }
    }

    this.throwVersionConflict();
  }

  private isRetryableVersionConflict(error: unknown): boolean {
    const code = this.getPrismaErrorCode(error);
    return code === 'P2002' || code === 'P2034';
  }

  private getPrismaErrorCode(error: unknown): string | undefined {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code;
    }
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = (error as { code?: unknown }).code;
      return typeof code === 'string' ? code : undefined;
    }
    return undefined;
  }

  private throwClassNotFound(): never {
    throw new BusinessException('CLASS_NOT_FOUND', '班级不存在', HttpStatus.NOT_FOUND);
  }

  private throwVersionNotFound(): never {
    throw new BusinessException(
      'SEAT_LAYOUT_VERSION_NOT_FOUND',
      '座位布局版本不存在',
      HttpStatus.NOT_FOUND,
    );
  }

  private throwVersionConflict(): never {
    throw new BusinessException(
      'SEAT_LAYOUT_VERSION_CONFLICT',
      '座位布局版本已发生变化，请重新加载后再保存',
      HttpStatus.CONFLICT,
    );
  }
}
