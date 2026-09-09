import { Avatar, Typography } from "antd";
import React, { forwardRef } from "react";
import type { Student } from "../admin-data";

export interface DragPreviewProps {
  student: Student | null;
}

export const DragPreview = forwardRef<HTMLDivElement, DragPreviewProps>(
  function DragPreview({ student }, ref) {
    return (
      <div
        ref={ref}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          display: "none",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderRadius: 12,
          background: "#ffffff",
          border: "2px solid #0a59f7",
          boxShadow: "0 12px 28px rgba(10, 89, 247, 0.22)",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 99999,
          willChange: "transform",
        }}
      >
        {student && (
          <>
            <Avatar
              size={28}
              style={{
                background: "#e0ecff",
                color: "#0a59f7",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {student.name.slice(0, 1)}
            </Avatar>
            <span
              style={{
                maxWidth: 100,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <Typography.Text
                strong
                style={{ fontSize: 13, color: "#0a59f7" }}
              >
                {student.name}
              </Typography.Text>
            </span>
          </>
        )}
      </div>
    );
  }
);
