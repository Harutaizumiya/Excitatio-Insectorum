"use client";

import { Button, Space, Typography } from "antd";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Point } from "./types";

export interface SeatingViewportHandle {
  getViewportRect: () => DOMRect | null;
  getPan: () => Point;
  getScale: () => number;
  resetViewport: () => void;
}

interface SeatingViewportProps {
  children: ReactNode;
  isDragging?: boolean;
}

export const suppressCellClick = { current: false };

export const SeatingViewport = forwardRef<SeatingViewportHandle, SeatingViewportProps>(
  function SeatingViewport({ children, isDragging = false }, ref) {
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const viewportRef = useRef<HTMLDivElement>(null);
    const panStartRef = useRef<{
      pointerId: number;
      startX: number;
      startY: number;
      panX: number;
      panY: number;
      hasMoved: boolean;
    } | null>(null);

    const panRef = useRef(pan);
    panRef.current = pan;

    const scaleRef = useRef(scale);
    scaleRef.current = scale;

    useImperativeHandle(ref, () => ({
      getViewportRect: () => viewportRef.current?.getBoundingClientRect() ?? null,
      getPan: () => panRef.current,
      getScale: () => scaleRef.current,
      resetViewport: () => {
        setScale(1);
        setPan({ x: 0, y: 0 });
      },
    }));

    const adjustScale = useCallback((delta: number) => {
      setScale((current) => Math.min(1.5, Math.max(0.6, Number((current + delta).toFixed(2)))));
    }, []);

    const resetViewport = useCallback(() => {
      setScale(1);
      setPan({ x: 0, y: 0 });
    }, []);

    // Native non-passive wheel listener for smooth continuous zooming
    useEffect(() => {
      const el = viewportRef.current;
      if (!el) return;

      const handleNativeWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const step = e.deltaY < 0 ? 0.03 : -0.03;
        setScale((current) => Math.min(1.5, Math.max(0.6, Number((current + step).toFixed(2)))));
      };

      el.addEventListener("wheel", handleNativeWheel, { passive: false });
      return () => {
        el.removeEventListener("wheel", handleNativeWheel);
      };
    }, []);

    const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
      if (isDragging) return;
      const target = e.target as HTMLElement;

      // Do not pan if clicking on student cards, interactive buttons, or inputs
      if (
        target.closest("[data-dnd-student]") ||
        target.closest("button") ||
        target.closest("input")
      ) {
        return;
      }

      panStartRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
        hasMoved: false,
      };
      suppressCellClick.current = false;
    };

    const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = panStartRef.current;
      if (!start || start.pointerId !== e.pointerId) return;

      const deltaX = e.clientX - start.startX;
      const deltaY = e.clientY - start.startY;

      if (!start.hasMoved && Math.hypot(deltaX, deltaY) > 4) {
        start.hasMoved = true;
        setIsPanning(true);
        suppressCellClick.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }

      if (start.hasMoved) {
        setPan({
          x: start.panX + deltaX,
          y: start.panY + deltaY,
        });
      }
    };

    const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = panStartRef.current;
      if (start?.pointerId === e.pointerId) {
        if (start.hasMoved) {
          suppressCellClick.current = true;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          window.setTimeout(() => {
            suppressCellClick.current = false;
          }, 50);
        } else {
          suppressCellClick.current = false;
        }
        panStartRef.current = null;
        setIsPanning(false);
      }
    };

    return (
      <div style={{ position: "relative", width: "100%", userSelect: "none" }}>
        {/* Viewport Scale & Reset Controls */}
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 10,
            background: "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(6px)",
            padding: "4px 8px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
          }}
        >
          <Space size={6}>
            <Button
              size="small"
              aria-label="缩小"
              onClick={() => adjustScale(-0.05)}
            >
              -
            </Button>
            <Typography.Text
              type="secondary"
              style={{ width: 44, textAlign: "center", fontSize: 12 }}
            >
              {Math.round(scale * 100)}%
            </Typography.Text>
            <Button
              size="small"
              aria-label="放大"
              onClick={() => adjustScale(0.05)}
            >
              +
            </Button>
            <Button
              size="small"
              onClick={resetViewport}
            >
              重置
            </Button>
          </Space>
        </div>

        {/* Canvas Viewport */}
        <div
          ref={viewportRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            overflow: "hidden",
            height: "min(640px, 65vh)",
            borderRadius: 16,
            background: "#f7f9fc",
            border: "1px solid #e7edf5",
            cursor: isPanning ? "grabbing" : "grab",
            touchAction: "none",
            position: "relative",
          }}
        >
          <div
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
              transformOrigin: "top left",
              transition: isPanning ? "none" : "transform 100ms cubic-bezier(0.2, 0, 0, 1)",
              padding: 16,
              boxSizing: "border-box",
              width: "fit-content",
              position: "relative",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    );
  }
);
