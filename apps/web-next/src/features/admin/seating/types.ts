export type Point = {
  x: number;
  y: number;
};

export type GridPosition = {
  row: number;
  col: number;
};

export type GridConfig = {
  rows: number;
  cols: number;
  cellWidth: number;
  cellHeight: number;
  columnGap: number;
  rowGap: number;
  offsetX: number;
  offsetY: number;
};

export type DragSource = GridPosition | { type: 'unseated' };

export type DragState = {
  studentId: string;
  source: DragSource;
} | null;

export type DropTarget = { type: 'grid'; row: number; col: number } | { type: 'unseated' } | null;

export type MoveResult =
  | {
      type: 'move';
      studentId: string;
      from: DragSource;
      to: GridPosition | { type: 'unseated' };
    }
  | {
      type: 'swap';
      studentAId: string;
      studentBId: string;
      from: GridPosition;
      to: GridPosition;
    }
  | {
      type: 'invalid';
      reason?: string;
    };
