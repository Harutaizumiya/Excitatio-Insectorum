import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Seat } from '../admin-data';
import { gridToCanvas, hitTestGridCell, screenToCanvas } from './grid-coordinates';
import { applyMoveResult, calculateMove, getSeatKey } from './seat-occupancy';
import type { SeatingViewportHandle } from './seating-viewport';
import type { DragSource, DragState, DropTarget, GridConfig, Point } from './types';

interface UseStudentDragOptions {
  viewportHandleRef: RefObject<SeatingViewportHandle | null>;
  unseatedPanelRef: RefObject<HTMLDivElement | null>;
  dragPreviewRef: RefObject<HTMLDivElement | null>;
  dropIndicatorRef: RefObject<HTMLDivElement | null>;
  gridConfig: GridConfig;
  seats: Seat[];
  onCommitSeats: (nextSeats: Seat[]) => void;
  disabled?: boolean;
}

export function useStudentDrag({
  viewportHandleRef,
  unseatedPanelRef,
  dragPreviewRef,
  dropIndicatorRef,
  gridConfig,
  seats,
  onCommitSeats,
  disabled = false,
}: UseStudentDragOptions) {
  const [dragState, setDragState] = useState<DragState>(null);

  const gridConfigRef = useRef(gridConfig);
  const seatsRef = useRef(seats);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    gridConfigRef.current = gridConfig;
  }, [gridConfig]);

  useEffect(() => {
    seatsRef.current = seats;
  }, [seats]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const pointerRef = useRef<Point>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const activeDragRef = useRef<{ studentId: string; source: DragSource } | null>(null);
  const hoverTargetRef = useRef<DropTarget>(null);
  const cachedViewportRectRef = useRef<DOMRect | null>(null);
  const cachedUnseatedRectRef = useRef<DOMRect | null>(null);

  const updateDragFrame = useCallback(() => {
    rafRef.current = null;
    const pointer = pointerRef.current;
    const previewEl = dragPreviewRef.current;
    const indicatorEl = dropIndicatorRef.current;
    const viewportHandle = viewportHandleRef.current;
    const config = gridConfigRef.current;
    const currentSeats = seatsRef.current;
    const currentSeatsMap = new Map(currentSeats.map((s) => [getSeatKey(s.row, s.col), s]));

    if (previewEl) {
      previewEl.style.transform = `translate3d(${pointer.x - 60}px, ${pointer.y - 25}px, 0)`;
    }

    let target: DropTarget = null;

    // Check if hovering over unseated students panel
    const unseatedRect = cachedUnseatedRectRef.current;
    if (
      unseatedRect &&
      pointer.x >= unseatedRect.left &&
      pointer.x <= unseatedRect.right &&
      pointer.y >= unseatedRect.top &&
      pointer.y <= unseatedRect.bottom
    ) {
      target = { type: 'unseated' };
    } else {
      const viewportRect = cachedViewportRectRef.current;
      if (viewportRect && viewportHandle) {
        const pan = viewportHandle.getPan();
        const scale = viewportHandle.getScale();
        const canvasPoint = screenToCanvas(pointer.x, pointer.y, viewportRect, pan, scale);
        const gridPos = hitTestGridCell(canvasPoint, config);
        if (gridPos) {
          target = { type: 'grid', row: gridPos.row, col: gridPos.col };
        }
      }
    }

    hoverTargetRef.current = target;

    // Update DropIndicator directly in DOM
    if (indicatorEl) {
      if (target?.type === 'grid') {
        const targetKey = getSeatKey(target.row, target.col);
        const targetSeat = currentSeatsMap.get(targetKey);
        const isValidSeat = targetSeat && targetSeat.cellType === 'seat';

        if (!isValidSeat) {
          indicatorEl.style.display = 'none';
        } else {
          const cellBox = gridToCanvas(target.row, target.col, config);
          indicatorEl.style.display = 'block';
          indicatorEl.style.transform = `translate3d(${cellBox.x}px, ${cellBox.y}px, 0)`;
          indicatorEl.style.width = `${cellBox.width}px`;
          indicatorEl.style.height = `${cellBox.height}px`;

          if (targetSeat.studentId) {
            // Swap indicator (accent)
            indicatorEl.style.borderColor = '#fa8c16';
            indicatorEl.style.backgroundColor = 'rgba(250, 140, 22, 0.12)';
            indicatorEl.style.boxShadow = '0 0 0 3px rgba(250, 140, 22, 0.2)';
          } else {
            // Normal placement indicator (blue)
            indicatorEl.style.borderColor = '#0a59f7';
            indicatorEl.style.backgroundColor = 'rgba(10, 89, 247, 0.08)';
            indicatorEl.style.boxShadow = '0 0 0 3px rgba(10, 89, 247, 0.15)';
          }
        }
      } else {
        indicatorEl.style.display = 'none';
      }
    }
  }, [viewportHandleRef, dragPreviewRef, dropIndicatorRef]);

  const endDrag = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (dragPreviewRef.current) {
      dragPreviewRef.current.style.display = 'none';
    }
    if (dropIndicatorRef.current) {
      dropIndicatorRef.current.style.display = 'none';
    }

    const active = activeDragRef.current;
    const target = hoverTargetRef.current;

    if (active && target) {
      const move = calculateMove(active.studentId, active.source, target, seatsRef.current);
      if (move.type !== 'invalid') {
        const nextSeats = applyMoveResult(seatsRef.current, move);
        onCommitSeats(nextSeats);
      }
    }

    activeDragRef.current = null;
    hoverTargetRef.current = null;
    setDragState(null);
  }, [dragPreviewRef, dropIndicatorRef, onCommitSeats]);

  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
      if (!activeDragRef.current) return;
      pointerRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(updateDragFrame);
      }
    };

    const handleWindowPointerUp = () => {
      if (!activeDragRef.current) return;
      endDrag();
    };

    const handleWindowPointerCancel = () => {
      if (!activeDragRef.current) return;
      endDrag();
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: true });
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [updateDragFrame, endDrag]);

  const handleStudentPointerDown = useCallback(
    (studentId: string, source: DragSource, e: React.PointerEvent<HTMLDivElement>) => {
      if (disabledRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      activeDragRef.current = { studentId, source };
      pointerRef.current = { x: e.clientX, y: e.clientY };

      cachedViewportRectRef.current = viewportHandleRef.current?.getViewportRect() ?? null;
      cachedUnseatedRectRef.current = unseatedPanelRef.current?.getBoundingClientRect() ?? null;

      if (dragPreviewRef.current) {
        dragPreviewRef.current.style.display = 'flex';
        dragPreviewRef.current.style.transform = `translate3d(${e.clientX - 60}px, ${e.clientY - 25}px, 0)`;
      }

      setDragState({ studentId, source });
    },
    [viewportHandleRef, unseatedPanelRef, dragPreviewRef],
  );

  return {
    dragState,
    handleStudentPointerDown,
  };
}
