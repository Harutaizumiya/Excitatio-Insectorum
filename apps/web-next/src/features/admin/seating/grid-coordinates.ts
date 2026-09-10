import type { GridConfig, GridPosition, Point } from './types';

/**
 * screen coordinates
 *   ↓ - viewportRect.left, viewportRect.top
 * viewport-relative coordinates
 *   ↓ - pan.x, pan.y
 * panned coordinates
 *   ↓ / scale
 * canvas-local coordinates
 */
export function screenToCanvas(
  clientX: number,
  clientY: number,
  viewportRect: { left: number; top: number },
  pan: Point,
  scale: number,
): Point {
  if (scale === 0) return { x: 0, y: 0 };
  return {
    x: (clientX - viewportRect.left - pan.x) / scale,
    y: (clientY - viewportRect.top - pan.y) / scale,
  };
}

/**
 * Hit tests a canvas-local point against the uniform grid.
 * Accurately determines (row, col) and ensures the point does not lie in gap areas or out of bounds.
 */
export function hitTestGridCell(canvasPoint: Point, config: GridConfig): GridPosition | null {
  const { rows, cols, cellWidth, cellHeight, columnGap, rowGap, offsetX, offsetY } = config;

  const relX = canvasPoint.x - offsetX;
  const relY = canvasPoint.y - offsetY;

  if (relX < 0 || relY < 0) {
    return null;
  }

  const stepX = cellWidth + columnGap;
  const stepY = cellHeight + rowGap;

  const col = Math.floor(relX / stepX);
  const row = Math.floor(relY / stepY);

  if (col < 0 || col >= cols || row < 0 || row >= rows) {
    return null;
  }

  // Check if point falls within the cell body (and not in the inter-cell gap)
  const cellLeft = col * stepX;
  const cellTop = row * stepY;

  const inCellX = relX >= cellLeft && relX <= cellLeft + cellWidth;
  const inCellY = relY >= cellTop && relY <= cellTop + cellHeight;

  if (!inCellX || !inCellY) {
    return null;
  }

  return { row, col };
}

/**
 * Returns top-left canvas-local coordinates and dimensions for a given grid cell.
 */
export function gridToCanvas(
  row: number,
  col: number,
  config: GridConfig,
): { x: number; y: number; width: number; height: number } {
  const stepX = config.cellWidth + config.columnGap;
  const stepY = config.cellHeight + config.rowGap;

  return {
    x: config.offsetX + col * stepX,
    y: config.offsetY + row * stepY,
    width: config.cellWidth,
    height: config.cellHeight,
  };
}
