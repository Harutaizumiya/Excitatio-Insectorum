export type RotationSeatCellType = 'SEAT' | 'AISLE' | 'PODIUM' | 'EMPTY';

export interface RotationSeat {
  rowIndex: number;
  colIndex: number;
  studentId: string | null;
  cellType: RotationSeatCellType;
}

export interface SeatRotationResult {
  seats: RotationSeat[];
  rotatedRows: number[];
}

/**
 * Shift occupied SEAT cells one position to the right within each row.
 *
 * A row is rotated only when it has at least two occupied SEAT cells. Other
 * cell types, empty SEAT cells, and rows with zero or one occupied cell are
 * copied without modification.
 */
export function rotateOccupiedSeatsRight(input: readonly RotationSeat[]): SeatRotationResult {
  const seats = input.map((seat) => ({ ...seat }));
  const rows = new Map<number, number[]>();

  seats.forEach((seat, index) => {
    const row = rows.get(seat.rowIndex) ?? [];
    row.push(index);
    rows.set(seat.rowIndex, row);
  });

  const rotatedRows: number[] = [];
  for (const [rowIndex, indexes] of rows) {
    const occupied = indexes
      .map((index) => seats[index])
      .filter(
        (seat): seat is RotationSeat & { studentId: string } =>
          seat.cellType === 'SEAT' && seat.studentId !== null,
      )
      .sort((left, right) => left.colIndex - right.colIndex);

    if (occupied.length < 2) {
      continue;
    }

    const assignments = occupied.map((seat) => seat.studentId);
    let changed = false;
    occupied.forEach((seat, index) => {
      const nextStudentId = assignments[(index - 1 + assignments.length) % assignments.length]!;
      if (seat.studentId !== nextStudentId) {
        changed = true;
      }
      seat.studentId = nextStudentId;
    });

    if (changed) {
      rotatedRows.push(rowIndex);
    }
  }

  rotatedRows.sort((left, right) => left - right);
  return { seats, rotatedRows };
}
