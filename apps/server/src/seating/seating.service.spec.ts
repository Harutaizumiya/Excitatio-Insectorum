import { StudentStatus } from '@prisma/client';
import type { PrismaService } from '../prisma';
import { SeatingService } from './seating.service';
import { SaveSeatLayoutDto } from './dto/seat-layout.dto';

type MockFunction = jest.Mock;

interface SeatingMocks {
  prisma: PrismaService;
  tx: {
    classroom: { findUnique: MockFunction; updateMany: MockFunction };
    student: { findMany: MockFunction };
    seatLayoutVersion: {
      findFirst: MockFunction;
      findUnique: MockFunction;
      create: MockFunction;
    };
    seat: { createMany: MockFunction };
  };
  publisher: { publishClassEvent: MockFunction };
}

function createMocks(): SeatingMocks {
  const tx = {
    classroom: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    student: { findMany: jest.fn().mockResolvedValue([{ id: 'student-1' }]) },
    seatLayoutVersion: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'version-1', version: 1 }),
    },
    seat: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };

  const prisma = {
    classroom: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    student: { findMany: jest.fn() },
    seatLayoutVersion: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    seat: { createMany: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as PrismaService & Record<string, unknown>;

  const transaction = prisma.$transaction as unknown as MockFunction;
  transaction.mockImplementation((operation: unknown) => {
    if (Array.isArray(operation)) {
      return Promise.all(operation);
    }
    return (operation as (client: typeof tx) => Promise<unknown>)(tx);
  });

  const publisher = { publishClassEvent: jest.fn().mockResolvedValue(undefined) };
  return { prisma, tx, publisher };
}

function setSaveDefaults(mocks: SeatingMocks, classroom = {}) {
  mocks.tx.classroom.findUnique.mockResolvedValue({
    gridRows: 2,
    gridCols: 2,
    currentLayoutVersionId: null,
    ...classroom,
  });
}

function saveDto(
  seats: SaveSeatLayoutDto['seats'],
  baseVersion?: number,
  grid?: Pick<SaveSeatLayoutDto, 'gridRows' | 'gridCols'>,
): SaveSeatLayoutDto {
  return { seats, ...grid, ...(baseVersion === undefined ? {} : { baseVersion }) };
}

describe('SeatingService', () => {
  it('rejects duplicate cells before creating a snapshot', async () => {
    const mocks = createMocks();
    setSaveDefaults(mocks);
    const service = new SeatingService(mocks.prisma, mocks.publisher);

    await expect(
      service.saveLayout(
        'class-1',
        'teacher-1',
        saveDto([
          { row: 0, col: 0, studentId: null },
          { row: 0, col: 0, studentId: null },
        ]),
      ),
    ).rejects.toMatchObject({ code: 'SEAT_LAYOUT_CELL_DUPLICATE' });
    expect(mocks.tx.seatLayoutVersion.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate students and out-of-bounds coordinates', async () => {
    const duplicateStudentMocks = createMocks();
    setSaveDefaults(duplicateStudentMocks);
    const duplicateStudentService = new SeatingService(
      duplicateStudentMocks.prisma,
      duplicateStudentMocks.publisher,
    );

    await expect(
      duplicateStudentService.saveLayout(
        'class-1',
        'teacher-1',
        saveDto([
          { row: 0, col: 0, studentId: 'student-1' },
          { row: 0, col: 1, studentId: 'student-1' },
        ]),
      ),
    ).rejects.toMatchObject({ code: 'SEAT_LAYOUT_STUDENT_DUPLICATE' });

    const boundsMocks = createMocks();
    setSaveDefaults(boundsMocks);
    const boundsService = new SeatingService(boundsMocks.prisma, boundsMocks.publisher);
    await expect(
      boundsService.saveLayout(
        'class-1',
        'teacher-1',
        saveDto([{ row: 2, col: 0, studentId: null }]),
      ),
    ).rejects.toMatchObject({ code: 'SEAT_LAYOUT_COORDINATE_OUT_OF_BOUNDS' });
  });

  it('accepts seats in an expanded grid and persists the new dimensions', async () => {
    const mocks = createMocks();
    setSaveDefaults(mocks);
    const service = new SeatingService(mocks.prisma, mocks.publisher);

    await expect(
      service.saveLayout(
        'class-1',
        'teacher-1',
        saveDto([{ row: 2, col: 0, studentId: null }], undefined, { gridRows: 3, gridCols: 2 }),
      ),
    ).resolves.toEqual({ versionId: 'version-1', version: 1 });

    expect(mocks.tx.classroom.updateMany).toHaveBeenCalledWith({
      where: { id: 'class-1', currentLayoutVersionId: null },
      data: { currentLayoutVersionId: 'version-1', gridRows: 3, gridCols: 2 },
    });
  });

  it('rejects inactive or cross-class students', async () => {
    const mocks = createMocks();
    setSaveDefaults(mocks);
    mocks.tx.student.findMany.mockResolvedValue([]);
    const service = new SeatingService(mocks.prisma, mocks.publisher);

    await expect(
      service.saveLayout(
        'class-1',
        'teacher-1',
        saveDto([{ row: 0, col: 0, studentId: 'inactive-or-other-class' }]),
      ),
    ).rejects.toMatchObject({ code: 'SEAT_LAYOUT_STUDENT_INVALID' });
    expect(mocks.tx.student.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['inactive-or-other-class'] },
        classId: 'class-1',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
  });

  it('maps a stale baseVersion to a 409 conflict', async () => {
    const mocks = createMocks();
    setSaveDefaults(mocks, { currentLayoutVersionId: 'version-2' });
    mocks.tx.seatLayoutVersion.findUnique.mockResolvedValue({ version: 2 });
    const service = new SeatingService(mocks.prisma, mocks.publisher);

    await expect(
      service.saveLayout('class-1', 'teacher-1', saveDto([{ row: 0, col: 0, studentId: null }], 1)),
    ).rejects.toMatchObject({ code: 'SEAT_LAYOUT_VERSION_CONFLICT', status: 409 });
    expect(mocks.tx.seatLayoutVersion.create).not.toHaveBeenCalled();
  });

  it('restores by creating a new version with sourceVersionId and never mutates history', async () => {
    const mocks = createMocks();
    mocks.tx.classroom.findUnique.mockResolvedValue({
      gridRows: 2,
      gridCols: 2,
      currentLayoutVersionId: 'version-2',
    });
    mocks.tx.seatLayoutVersion.findFirst
      .mockResolvedValueOnce({
        id: 'version-1',
        seats: [{ rowIndex: 0, colIndex: 1, studentId: 'student-1' }],
      })
      .mockResolvedValueOnce({ version: 2 });
    mocks.tx.seatLayoutVersion.create.mockResolvedValue({ id: 'version-3', version: 3 });
    const service = new SeatingService(mocks.prisma, mocks.publisher);

    await expect(service.restoreVersion('class-1', 'version-1', 'teacher-1')).resolves.toEqual({
      versionId: 'version-3',
      version: 3,
      sourceVersionId: 'version-1',
    });
    expect(mocks.tx.seatLayoutVersion.create).toHaveBeenCalledWith({
      data: {
        classId: 'class-1',
        version: 3,
        sourceVersionId: 'version-1',
        createdBy: 'teacher-1',
      },
      select: { id: true, version: true },
    });
    expect(mocks.tx.seat.createMany).toHaveBeenCalledWith({
      data: [
        {
          layoutVersionId: 'version-3',
          rowIndex: 0,
          colIndex: 1,
          studentId: 'student-1',
          cellType: 'SEAT',
        },
      ],
    });
    expect(mocks.publisher.publishClassEvent).toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({
        type: 'SEAT_LAYOUT_CHANGED',
        classId: 'class-1',
        payload: { version: 3 },
      }),
    );
  });

  it('restores historical cells but clears students who are no longer ACTIVE', async () => {
    const mocks = createMocks();
    mocks.tx.classroom.findUnique.mockResolvedValue({
      gridRows: 2,
      gridCols: 2,
      currentLayoutVersionId: 'version-2',
    });
    mocks.tx.seatLayoutVersion.findFirst
      .mockResolvedValueOnce({
        id: 'version-1',
        seats: [{ rowIndex: 0, colIndex: 1, studentId: 'inactive-student' }],
      })
      .mockResolvedValueOnce({ version: 2 });
    mocks.tx.student.findMany.mockResolvedValue([]);
    mocks.tx.seatLayoutVersion.create.mockResolvedValue({ id: 'version-3', version: 3 });
    const service = new SeatingService(mocks.prisma, mocks.publisher);

    await service.restoreVersion('class-1', 'version-1', 'teacher-1');

    expect(mocks.tx.seat.createMany).toHaveBeenCalledWith({
      data: [
        {
          layoutVersionId: 'version-3',
          rowIndex: 0,
          colIndex: 1,
          studentId: null,
          cellType: 'SEAT',
        },
      ],
    });
  });

  it('retries a unique version collision and preserves the transaction boundary', async () => {
    const mocks = createMocks();
    setSaveDefaults(mocks);
    mocks.tx.seatLayoutVersion.create
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValueOnce({ id: 'version-1', version: 1 });
    const service = new SeatingService(mocks.prisma, mocks.publisher);

    await expect(
      service.saveLayout('class-1', 'teacher-1', saveDto([{ row: 0, col: 0, studentId: null }])),
    ).resolves.toEqual({ versionId: 'version-1', version: 1 });
    expect(mocks.tx.seatLayoutVersion.create).toHaveBeenCalledTimes(2);
    expect(mocks.publisher.publishClassEvent).toHaveBeenCalledTimes(1);
  });
});
