import type { Seat } from "../admin-data";
import type { DragSource, DropTarget, GridPosition, MoveResult } from "./types";

export function getSeatKey(row: number, col: number): string {
  return `${row}:${col}`;
}

export function buildOccupancyMap(seats: Seat[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const seat of seats) {
    if (seat.studentId) {
      map.set(getSeatKey(seat.row, seat.col), seat.studentId);
    }
  }
  return map;
}

export function buildSeatMap(seats: Seat[]): Map<string, Seat> {
  const map = new Map<string, Seat>();
  for (const seat of seats) {
    map.set(getSeatKey(seat.row, seat.col), seat);
  }
  return map;
}

/**
 * Pure function to calculate the semantic MoveResult from source to target.
 */
export function calculateMove(
  studentId: string,
  source: DragSource,
  target: DropTarget,
  seats: Seat[]
): MoveResult {
  if (!target) {
    return { type: "invalid", reason: "no target" };
  }

  const isSourceUnseated = "type" in source && source.type === "unseated";
  const seatMap = buildSeatMap(seats);

  // Case 1: Drop onto unseated panel
  if (target.type === "unseated") {
    if (isSourceUnseated) {
      return { type: "invalid", reason: "already unseated" };
    }
    return {
      type: "move",
      studentId,
      from: source,
      to: { type: "unseated" },
    };
  }

  // Case 2: Drop onto grid cell
  const targetKey = getSeatKey(target.row, target.col);
  const targetSeat = seatMap.get(targetKey);

  // Target must be a configured "seat" cell! (Not empty/blank, not aisle, not podium)
  if (!targetSeat || targetSeat.cellType !== "seat") {
    return { type: "invalid", reason: "not a configured seat" };
  }

  // If dropped on the same seat
  if (!isSourceUnseated) {
    const sourcePos = source as GridPosition;
    if (sourcePos.row === target.row && sourcePos.col === target.col) {
      return { type: "invalid", reason: "same position" };
    }
  }

  const targetStudentId = targetSeat.studentId;

  // Target seat already has a student
  if (targetStudentId) {
    if (isSourceUnseated) {
      // Unseated student replaces target student (target student returns to unseated list)
      return {
        type: "move",
        studentId,
        from: source,
        to: { row: target.row, col: target.col },
      };
    } else {
      // Seated student swaps with target student
      return {
        type: "swap",
        studentAId: studentId,
        studentBId: targetStudentId,
        from: source as GridPosition,
        to: { row: target.row, col: target.col },
      };
    }
  }

  // Target seat is empty
  return {
    type: "move",
    studentId,
    from: source,
    to: { row: target.row, col: target.col },
  };
}

/**
 * Pure function to apply a MoveResult to a Seat array.
 */
export function applyMoveResult(seats: Seat[], move: MoveResult): Seat[] {
  if (move.type === "invalid") {
    return seats;
  }

  if (move.type === "move") {
    const { studentId, from, to } = move;
    const isFromUnseated = "type" in from && from.type === "unseated";
    const isToUnseated = "type" in to && to.type === "unseated";

    if (isToUnseated) {
      if (isFromUnseated) return seats;
      const fromPos = from as GridPosition;
      return seats.map((seat) =>
        seat.row === fromPos.row && seat.col === fromPos.col
          ? { ...seat, studentId: null }
          : seat
      );
    }

    const toPos = to as GridPosition;
    const targetKey = getSeatKey(toPos.row, toPos.col);

    let nextSeats = [...seats];

    // If source was in a seat, clear source seat
    if (!isFromUnseated) {
      const fromPos = from as GridPosition;
      nextSeats = nextSeats.map((seat) =>
        seat.row === fromPos.row && seat.col === fromPos.col
          ? { ...seat, studentId: null }
          : seat
      );
    }

    // Set target seat (must be an existing configured seat)
    nextSeats = nextSeats.map((seat) =>
      getSeatKey(seat.row, seat.col) === targetKey
        ? { ...seat, studentId }
        : seat
    );

    return nextSeats;
  }

  if (move.type === "swap") {
    const { studentAId, studentBId, from, to } = move;
    const fromKey = getSeatKey(from.row, from.col);
    const toKey = getSeatKey(to.row, to.col);

    return seats.map((seat) => {
      const key = getSeatKey(seat.row, seat.col);
      if (key === fromKey) {
        return { ...seat, studentId: studentBId };
      }
      if (key === toKey) {
        return { ...seat, studentId: studentAId };
      }
      return seat;
    });
  }

  return seats;
}
