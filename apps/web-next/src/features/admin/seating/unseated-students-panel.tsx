"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Badge, Card, Empty, Input, Typography } from "antd";
import type { CSSProperties, RefObject } from "react";
import React, { memo } from "react";
import type { Student } from "../admin-data";
import { StaticStudent } from "./seat-cell";
import type { DragSource } from "./types";

const cardStyle: CSSProperties = {
  border: "1px solid #e5ebf4",
  boxShadow: "0 8px 24px rgba(34, 68, 116, 0.045)",
  background: "#ffffff",
};

interface UnseatedStudentsPanelProps {
  unseatedStudents: Student[];
  totalUnseated: number;
  search: string;
  draggingStudentId: string | null;
  panelRef: RefObject<HTMLDivElement | null>;
  onSearchChange: (value: string) => void;
  onStudentPointerDown: (
    studentId: string,
    source: DragSource,
    e: React.PointerEvent<HTMLDivElement>
  ) => void;
}

export const UnseatedStudentsPanel = memo(function UnseatedStudentsPanel({
  unseatedStudents,
  totalUnseated,
  search,
  draggingStudentId,
  panelRef,
  onSearchChange,
  onStudentPointerDown,
}: UnseatedStudentsPanelProps) {
  return (
    <div ref={panelRef} data-unseated-panel="true" style={{ width: "100%" }}>
      <Card
        style={cardStyle}
        styles={{ body: { padding: 16 } }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Typography.Text strong>未安排学生</Typography.Text>
          <Badge
            count={totalUnseated}
            overflowCount={99}
            style={{ background: totalUnseated > 0 ? "#0a59f7" : "#8c9ba5" }}
          />
        </div>

        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索姓名或学号"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ marginBottom: 14, userSelect: "text" }}
        />

        <div
          id="unseated-list"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxHeight: 360,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {unseatedStudents.length > 0 ? (
            unseatedStudents.map((student) => (
              <StaticStudent
                key={student.id}
                student={student}
                isDragging={draggingStudentId === student.id}
                onPointerDown={(e) => onStudentPointerDown(student.id, { type: "unseated" }, e)}
              />
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={search ? "无匹配学生" : "所有学生都已就座"}
              style={{ margin: "24px 0" }}
            />
          )}
        </div>
      </Card>
    </div>
  );
});
