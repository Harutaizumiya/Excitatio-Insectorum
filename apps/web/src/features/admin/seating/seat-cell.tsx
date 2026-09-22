"use client";

import { CloseOutlined } from "@ant-design/icons";
import { Avatar, Button, Typography } from "antd";
import React, { memo } from "react";
import { formatSeat, type Seat, type Student } from "../admin-data";
import type { DragSource } from "./types";

export interface StaticStudentProps {
  student: Pick<Student, "id" | "name" | "studentNo">;
  compact?: boolean;
  isDragging?: boolean;
  disabled?: boolean;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export const StaticStudent = memo(function StaticStudent({
  student,
  compact = false,
  isDragging = false,
  disabled = false,
  onPointerDown,
}: StaticStudentProps) {
  return (
    <div
      data-dnd-student="true"
      onPointerDown={disabled ? undefined : onPointerDown}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: compact ? "center" : "flex-start",
        gap: compact ? 6 : 10,
        padding: compact ? "4px 6px" : "9px 12px",
        borderRadius: compact ? 10 : 12,
        background: "#ffffff",
        border: compact ? "1px solid #d0e1fd" : "1px solid #e3ebf6",
        boxShadow: compact ? "none" : "0 2px 6px rgba(34, 68, 116, 0.04)",
        opacity: isDragging ? 0.28 : 1,
        cursor: disabled ? "default" : "grab",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <Avatar
        size={compact ? 24 : 32}
        style={{
          background: "#e0ecff",
          color: "#0a59f7",
          fontWeight: 700,
          flexShrink: 0,
          pointerEvents: "none",
        }}
      >
        {student.name.slice(0, 1)}
      </Avatar>
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        <Typography.Text
          strong
          style={{ display: "block", fontSize: 13, color: "#1e293b", pointerEvents: "none" }}
        >
          {student.name}
        </Typography.Text>
        {!compact && (
          <Typography.Text
            type="secondary"
            style={{ fontSize: 11, pointerEvents: "none" }}
          >
            学号 {student.studentNo}
          </Typography.Text>
        )}
      </span>
    </div>
  );
});

interface SeatCellProps {
  row: number;
  col: number;
  seat?: Seat;
  student?: Pick<Student, "id" | "name" | "studentNo">;
  isLayoutStage: boolean;
  readOnly?: boolean;
  emphasized?: boolean;
  height?: number | string;
  studentContent?: React.ReactNode;
  showSeatNumber?: boolean;
  isDraggingThis?: boolean;
  onCellClick?: (row: number, col: number) => void;
  onUnseat?: (seatId: string) => void;
  onStudentPointerDown?: (
    studentId: string,
    source: DragSource,
    e: React.PointerEvent<HTMLDivElement>
  ) => void;
}

export const SeatCell = memo(function SeatCell({
  row,
  col,
  seat,
  student,
  isLayoutStage,
  readOnly = false,
  emphasized = false,
  height = 80,
  studentContent,
  showSeatNumber = true,
  isDraggingThis = false,
  onCellClick,
  onUnseat,
  onStudentPointerDown,
}: SeatCellProps) {
  const cellType = seat?.cellType ?? (seat ? "seat" : "empty");
  const isSeat = cellType === "seat";
  const isPodium = cellType === "podium";
  const isAisle = cellType === "aisle";

  if (isLayoutStage) {
    if (!seat || cellType === "empty") {
      return (
        <div
          data-seat-cell={`cell-${row}-${col}`}
          onClick={() => onCellClick?.(row, col)}
          style={{
            height,
            borderRadius: 14,
            border: "1px dashed #d5dce7",
            background: "rgba(255,255,255,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#94a3b8",
            userSelect: "none",
          }}
          title={formatSeat(row, col)}
        >
          <span style={{ fontSize: 11, pointerEvents: "none" }}>空</span>
        </div>
      );
    }

    if (!isSeat) {
      return (
        <div
          data-seat-cell={`cell-${row}-${col}`}
          onClick={() => onCellClick?.(row, col)}
          style={{
            height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 14,
            border: isPodium ? "1.5px solid #9bb7e2" : "1px solid #d5d9e2",
            background: isPodium ? "#e8eef8" : "#eceef2",
            color: isPodium ? "#2f54eb" : "#8c93a3",
            fontWeight: isPodium ? 700 : 500,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <span style={{ pointerEvents: "none" }}>{isPodium ? "讲台" : "走廊"}</span>
        </div>
      );
    }

    return (
      <div
        data-seat-cell={`cell-${row}-${col}`}
        onClick={() => onCellClick?.(row, col)}
        style={{
          height,
          borderRadius: 14,
          border: "1.5px solid #adc6ff",
          background: "#ffffff",
          boxShadow: "0 2px 8px rgba(10, 89, 247, 0.06)",
          padding: "6px 7px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#64748b", pointerEvents: "none" }}>
            {formatSeat(row, col)}
          </span>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#0a59f7",
            fontSize: 12,
            fontWeight: 500,
            pointerEvents: "none",
          }}
        >
          {student ? student.name : "座位"}
        </div>
      </div>
    );
  }

  // Assignment Stage: Aisles and Podiums cannot receive students
  if (isAisle || isPodium) {
    return (
      <div
        data-seat-cell={`cell-${row}-${col}`}
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 14,
          border: isPodium ? "1.5px solid #9bb7e2" : "1px solid #e2e8f0",
          background: isPodium ? "#e8eef8" : "#f1f5f9",
          color: isPodium ? "#2f54eb" : "#94a3b8",
          fontWeight: isPodium ? 700 : 500,
          userSelect: "none",
        }}
      >
        <span style={{ pointerEvents: "none" }}>{isPodium ? "讲台" : "走廊"}</span>
      </div>
    );
  }

  const occupied = Boolean(student);
  const isConfiguredSeat = Boolean(seat && isSeat);

  // Assignment Stage: If cell is empty/空, do not render grid cell box in assignment mode
  if (!isConfiguredSeat && !occupied) {
    return <div style={{ height, pointerEvents: "none" }} />;
  }

  return (
    <div
      data-seat-cell={`cell-${row}-${col}`}
      style={{
        height,
        position: "relative",
        borderRadius: 14,
        border: occupied
          ? `${emphasized ? 2.5 : 1.5}px solid ${emphasized ? "#1677ff" : "#adc6ff"}`
          : "1.5px dashed #c4d4eb",
        background: occupied && emphasized ? "#e6f4ff" : occupied ? "#ffffff" : "#fafcff",
        boxShadow: occupied
          ? emphasized
            ? "0 2px 8px rgba(22, 119, 255, 0.16)"
            : "0 2px 8px rgba(10, 89, 247, 0.06)"
          : "none",
        padding: "6px 7px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        {showSeatNumber ? (
          <span style={{ fontSize: 10, fontWeight: 600, color: occupied ? "#64748b" : "#94a3b8", pointerEvents: "none" }}>
            {formatSeat(row, col)}
          </span>
        ) : <span aria-hidden="true" />}
        {occupied && !readOnly ? (
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined style={{ fontSize: 10 }} />}
            aria-label={`移出 ${student?.name}`}
            title="移出座位"
            onClick={(e) => {
              e.stopPropagation();
              if (seat) onUnseat?.(seat.id);
            }}
            style={{ width: 18, height: 18, minWidth: 18, padding: 0, color: "#94a3b8" }}
          />
        ) : (
          <span />
        )}
      </div>

      {student ? (
        studentContent ?? (
          <StaticStudent
            student={student}
            compact
            isDragging={isDraggingThis}
            onPointerDown={(e) => onStudentPointerDown?.(student.id, { row, col }, e)}
          />
        )
      ) : studentContent ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#94a3b8",
            fontSize: 12,
            fontWeight: 500,
            pointerEvents: "none",
          }}
        >
          {studentContent}
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#94a3b8",
            fontSize: 12,
            fontWeight: 500,
            pointerEvents: "none",
          }}
        >
          空位
        </div>
      )}
    </div>
  );
});
