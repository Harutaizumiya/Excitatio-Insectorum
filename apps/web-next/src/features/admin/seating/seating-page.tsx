"use client";

import {
  ClearOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Drawer,
  InputNumber,
  Popconfirm,
  Row,
  Space,
  Tag,
  Typography,
} from "antd";
import { App as AntApp } from "antd";
import type { CSSProperties, ReactNode } from "react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  cloneSeats,
  formatSeat,
  type Seat,
  type SeatLayoutVersion,
} from "../admin-data";
import { useAdminSeating, useAdminStudents } from "../admin-queries";
import { DragPreview } from "./drag-preview";
import { DropIndicator } from "./drop-indicator";
import { SeatCell } from "./seat-cell";
import {
  SeatingViewport,
  suppressCellClick,
  type SeatingViewportHandle,
} from "./seating-viewport";
import type { GridConfig } from "./types";
import { UnseatedStudentsPanel } from "./unseated-students-panel";
import { useStudentDrag } from "./use-student-drag";

const cardStyle: CSSProperties = {
  border: "1px solid #e5ebf4",
  boxShadow: "0 8px 24px rgba(34, 68, 116, 0.045)",
  background: "#ffffff",
};

const primaryButtonStyle: CSSProperties = {
  boxShadow: "0 7px 16px rgba(10, 89, 247, 0.17)",
  fontWeight: 650,
};

const layoutCellCycle = ["seat", "aisle", "empty"] as const;

function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 20,
        marginBottom: 22,
      }}
    >
      <div>
        <Typography.Title level={2} style={{ margin: "5px 0 5px", color: "#172b4d", fontSize: 27 }}>
          {title}
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {description}
        </Typography.Text>
      </div>
      {action}
    </div>
  );
}

export function SeatingPage() {
  const { modal, notification } = AntApp.useApp();
  const { students } = useAdminStudents();
  const {
    gridRows,
    gridCols,
    seats,
    versions,
    isDirty,
    saveLayout: persistSave,
    restoreLayout: persistRestore,
    updateDraft,
  } = useAdminSeating();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [preview, setPreview] = useState<SeatLayoutVersion | null>(null);
  const [saving, setSaving] = useState(false);
  const [unseatedSearch, setUnseatedSearch] = useState("");
  const [stage, setStage] = useState<"layout" | "assignment">("assignment");
  const [settingPodium, setSettingPodium] = useState(false);
  const [layoutEditSnapshot, setLayoutEditSnapshot] = useState<{
    gridRows: number;
    gridCols: number;
    seats: Seat[];
  } | null>(null);

  const isLayoutStage = stage === "layout";

  // References for viewport and drag elements
  const viewportHandleRef = useRef<SeatingViewportHandle>(null);
  const unseatedPanelRef = useRef<HTMLDivElement>(null);
  const dragPreviewRef = useRef<HTMLDivElement>(null);
  const dropIndicatorRef = useRef<HTMLDivElement>(null);

  const studentById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);

  const assignedIds = useMemo(
    () => new Set(seats.flatMap((seat) => (seat.studentId ? [seat.studentId] : []))),
    [seats]
  );

  const unseatedStudents = useMemo(() => {
    return students
      .filter((student) => student.status === "ACTIVE" && !assignedIds.has(student.id))
      .filter(
        (student) =>
          !unseatedSearch ||
          student.name.includes(unseatedSearch.trim()) ||
          student.studentNo.includes(unseatedSearch.trim())
      );
  }, [students, assignedIds, unseatedSearch]);

  const seatByPosition = useMemo(
    () => new Map(seats.map((seat) => [`${seat.row}:${seat.col}`, seat])),
    [seats]
  );

  // Exact grid dimension configuration
  const gridCanvasWidth = Math.max(840, gridCols * 122);
  const columnGap = 10;
  const rowGap = 10;
  const cellHeight = 80;
  const cellWidth = (gridCanvasWidth - (gridCols - 1) * columnGap) / gridCols;

  const gridConfig: GridConfig = useMemo(
    () => ({
      rows: gridRows,
      cols: gridCols,
      cellWidth,
      cellHeight,
      columnGap,
      rowGap,
      offsetX: 0,
      offsetY: 0,
    }),
    [gridRows, gridCols, cellWidth, cellHeight, columnGap, rowGap]
  );

  const writeDraft = useCallback(
    (next: { gridRows?: number; gridCols?: number; seats?: Seat[] }) => {
      updateDraft({
        gridRows: next.gridRows ?? gridRows,
        gridCols: next.gridCols ?? gridCols,
        seats: next.seats ?? seats,
      });
    },
    [gridRows, gridCols, seats, updateDraft]
  );

  const onCommitSeats = useCallback(
    (nextSeats: Seat[]) => {
      writeDraft({ seats: nextSeats });
    },
    [writeDraft]
  );

  const { dragState, handleStudentPointerDown } = useStudentDrag({
    viewportHandleRef,
    unseatedPanelRef,
    dragPreviewRef,
    dropIndicatorRef,
    gridConfig,
    seats,
    onCommitSeats,
    disabled: isLayoutStage,
  });

  const activeStudent = dragState?.studentId ? studentById.get(dragState.studentId) ?? null : null;

  const applyCellType = useCallback(
    (row: number, col: number) => {
      const existing = seatByPosition.get(`${row}:${col}`);
      const currentType = existing?.cellType ?? (existing ? "seat" : "empty");
      const cycleType = currentType === "podium" ? "empty" : currentType;
      const nextType = layoutCellCycle[(layoutCellCycle.indexOf(cycleType) + 1) % layoutCellCycle.length];

      if (nextType === "empty") {
        writeDraft({ seats: seats.filter((item) => item.id !== existing?.id) });
        return;
      }

      const next = existing
        ? seats.map((item) =>
            item.id === existing.id ? { ...item, cellType: nextType, studentId: null } : item
          )
        : [...seats, { id: `cell-${row}-${col}`, row, col, studentId: null, cellType: nextType }];
      writeDraft({ seats: next });
    },
    [seatByPosition, seats, writeDraft]
  );

  const setPodium = useCallback(
    (row: number, col: number) => {
      const existing = seatByPosition.get(`${row}:${col}`);
      const withoutPodium = seats.filter((seat) => seat.id === existing?.id || seat.cellType !== "podium");
      const next = existing
        ? withoutPodium.map((seat) =>
            seat.id === existing.id ? { ...seat, cellType: "podium" as const, studentId: null } : seat
          )
        : [
            ...withoutPodium,
            { id: `cell-${row}-${col}`, row, col, studentId: null, cellType: "podium" as const },
          ];
      writeDraft({ seats: next });
      setSettingPodium(false);
    },
    [seatByPosition, seats, writeDraft]
  );

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (suppressCellClick.current) return;
      if (settingPodium) {
        setPodium(row, col);
      } else {
        applyCellType(row, col);
      }
    },
    [settingPodium, setPodium, applyCellType]
  );

  const unseatStudent = useCallback(
    (seatId: string) => {
      writeDraft({
        seats: seats.map((seat) => (seat.id === seatId ? { ...seat, studentId: null } : seat)),
      });
    },
    [seats, writeDraft]
  );

  const autoAssign = () => {
    const emptySeats = seats.filter((seat) => (seat.cellType ?? "seat") === "seat" && !seat.studentId);
    if (emptySeats.length === 0) {
      notification.warning({ title: "没有空位" });
      return;
    }
    const unseatedList = students.filter((s) => s.status === "ACTIVE" && !assignedIds.has(s.id));
    if (unseatedList.length === 0) {
      notification.info({ title: "已全部安排" });
      return;
    }

    const newSeats = [...seats];
    let assignIdx = 0;
    for (let i = 0; i < newSeats.length && assignIdx < unseatedList.length; i++) {
      if ((newSeats[i].cellType ?? "seat") === "seat" && !newSeats[i].studentId) {
        newSeats[i] = { ...newSeats[i], studentId: unseatedList[assignIdx].id };
        assignIdx++;
      }
    }
    writeDraft({ seats: newSeats });
    notification.success({ title: `已安排 ${assignIdx} 人` });
  };

  const clearAllSeats = () => {
    modal.confirm({
      title: "清空所有座位上的学生？",
      icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
      content: "所有学生将回到未安排列表。",
      okText: "确认清空",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        writeDraft({ seats: seats.map((seat) => ({ ...seat, studentId: null })) });
        notification.success({ title: "已清空所有座位" });
      },
    });
  };

  const saveLayout = async () => {
    setSaving(true);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 300));
    const result = await persistSave({ gridRows, gridCols, seats });
    setSaving(false);
    if (isLayoutStage) {
      setLayoutEditSnapshot(null);
      setStage("assignment");
      notification.success({ title: "布局已保存" });
    } else {
      notification.success({ title: `已保存版本 ${result.nextVersion}` });
    }
  };

  const restoreLayout = async (version: SeatLayoutVersion) => {
    const result = await persistRestore(version);
    setPreview(null);
    notification.success({ title: `已恢复为版本 ${result.nextVersion}` });
  };

  const totalSeats = seats.filter((s) => (s.cellType ?? "seat") === "seat").length;
  const seatedCount = seats.filter((s) => (s.cellType ?? "seat") === "seat" && s.studentId).length;

  const resizeGrid = (axis: "rows" | "cols", nextValue: number) => {
    const nextRows = axis === "rows" ? nextValue : gridRows;
    const nextCols = axis === "cols" ? nextValue : gridCols;
    const removed = seats.filter((seat) => seat.row >= nextRows || seat.col >= nextCols);
    const apply = () =>
      writeDraft({
        gridRows: nextRows,
        gridCols: nextCols,
        seats: seats.filter((seat) => seat.row < nextRows && seat.col < nextCols),
      });

    if (removed.length > 0) {
      modal.confirm({
        title: "缩小网格？",
        content: `将移除 ${removed.length} 个越界单元格，${
          removed.filter((seat) => seat.studentId).length
        } 名学生回到未安排列表。`,
        okText: "确认",
        cancelText: "取消",
        onOk: apply,
      });
      return;
    }
    apply();
  };

  return (
    <div className="seat-management-page" style={{ userSelect: "none" }}>
      <PageHeader
        title="座位管理"
        description={`${gridRows} 行 × ${gridCols} 列`}
        action={
          <Space>
            {!isLayoutStage && (
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  setLayoutEditSnapshot({ gridRows, gridCols, seats: cloneSeats(seats) });
                  setStage("layout");
                }}
              >
                编辑
              </Button>
            )}
            {isLayoutStage && (
              <Button
                onClick={() => {
                  if (layoutEditSnapshot) {
                    updateDraft({
                      ...layoutEditSnapshot,
                      seats: cloneSeats(layoutEditSnapshot.seats),
                    });
                  }
                  setSettingPodium(false);
                  setLayoutEditSnapshot(null);
                  setStage("assignment");
                }}
              >
                取消
              </Button>
            )}
            <Button icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>
              历史版本
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              style={primaryButtonStyle}
              loading={saving}
              disabled={!isDirty}
              onClick={() => void saveLayout()}
            >
              {isLayoutStage ? "保存并返回" : isDirty ? "保存" : "已保存"}
            </Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={isLayoutStage ? 24 : 18}>
          <Card style={cardStyle} styles={{ body: { padding: 22 } }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <Space size={8}>
                <Tag color="blue">
                  {seatedCount}/{totalSeats}
                </Tag>
                <Tag>{totalSeats - seatedCount} 空位</Tag>
              </Space>
              <Space size={8}>
                {isLayoutStage ? (
                  <Space size={6}>
                    <span>行</span>
                    <InputNumber
                      min={1}
                      max={20}
                      value={gridRows}
                      onChange={(value) => value && resizeGrid("rows", value)}
                      style={{ width: 72 }}
                    />
                    <span>列</span>
                    <InputNumber
                      min={1}
                      max={20}
                      value={gridCols}
                      onChange={(value) => value && resizeGrid("cols", value)}
                      style={{ width: 72 }}
                    />
                    <Button
                      type={settingPodium ? "primary" : "default"}
                      onClick={() => setSettingPodium((active) => !active)}
                    >
                      {settingPodium ? "选择位置" : "设置讲台"}
                    </Button>
                  </Space>
                ) : (
                  <>
                    <Button size="small" icon={<ThunderboltOutlined />} onClick={autoAssign}>
                      自动排座
                    </Button>
                    <Button size="small" icon={<ClearOutlined />} onClick={clearAllSeats}>
                      清空就座
                    </Button>
                  </>
                )}
              </Space>
            </div>

            <SeatingViewport ref={viewportHandleRef} isDragging={dragState !== null}>
              <div
                style={{
                  position: "relative",
                  width: gridCanvasWidth,
                }}
              >
                {/* Single Hardware-Accelerated Drop Indicator */}
                <DropIndicator ref={dropIndicatorRef} />

                {/* Grid Canvas */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${gridCols}, ${cellWidth}px)`,
                    gridAutoRows: cellHeight,
                    gap: 10,
                    width: gridCanvasWidth,
                    boxSizing: "border-box",
                  }}
                >
                  {Array.from({ length: gridRows * gridCols }, (_, index) => {
                    const row = Math.floor(index / gridCols);
                    const col = index % gridCols;
                    const cell = seatByPosition.get(`${row}:${col}`);
                    const student =
                      !isLayoutStage && cell?.studentId
                        ? studentById.get(cell.studentId)
                        : undefined;
                    return (
                      <SeatCell
                        key={`${row}-${col}`}
                        row={row}
                        col={col}
                        seat={cell}
                        student={student}
                        isLayoutStage={isLayoutStage}
                        isDraggingThis={dragState?.studentId === cell?.studentId}
                        onCellClick={handleCellClick}
                        onUnseat={unseatStudent}
                        onStudentPointerDown={handleStudentPointerDown}
                      />
                    );
                  })}
                </div>
              </div>
            </SeatingViewport>
          </Card>
        </Col>

        {!isLayoutStage && (
          <Col xs={24} xl={6}>
            <UnseatedStudentsPanel
              panelRef={unseatedPanelRef}
              unseatedStudents={unseatedStudents}
              totalUnseated={
                students.filter((s) => s.status === "ACTIVE" && !assignedIds.has(s.id)).length
              }
              search={unseatedSearch}
              draggingStudentId={dragState?.studentId ?? null}
              onSearchChange={setUnseatedSearch}
              onStudentPointerDown={handleStudentPointerDown}
            />
          </Col>
        )}
      </Row>

      {/* Single Hardware-Accelerated Drag Preview Layer */}
      <DragPreview ref={dragPreviewRef} student={activeStudent} />

      <Drawer
        title="座位布局历史"
        open={historyOpen}
        onClose={() => {
          setHistoryOpen(false);
          setPreview(null);
        }}
        size={500}
        styles={{ header: { userSelect: "none" }, body: { userSelect: "none" } }}
      >
        <Space orientation="vertical" size={10} style={{ display: "flex" }}>
          {versions.map((version) => (
            <div
              key={version.id}
              style={{
                padding: 14,
                border:
                  version.id === versions[0]?.id
                    ? "1px solid #9bbdff"
                    : "1px solid #e7edf5",
                borderRadius: 12,
                background: version.id === versions[0]?.id ? "#f4f8ff" : "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <Typography.Text strong>版本 {version.version}</Typography.Text>
                  {version.id === versions[0]?.id && (
                    <Tag color="blue" style={{ marginLeft: 8, borderRadius: 999 }}>
                      当前
                    </Tag>
                  )}
                  <Typography.Text
                    type="secondary"
                    style={{ display: "block", marginTop: 4, fontSize: 12 }}
                  >
                    {version.createdAt} · {version.createdBy}
                  </Typography.Text>
                </div>
                <Space size={4}>
                  <Button size="small" onClick={() => setPreview(version)}>
                    预览
                  </Button>
                  {version.id !== versions[0]?.id && (
                    <Popconfirm
                      title={`恢复版本 ${version.version}？`}
                      description="这会创建一个新的当前布局版本。"
                      okText="确认恢复"
                      cancelText="取消"
                      onConfirm={() => void restoreLayout(version)}
                    >
                      <Button size="small" type="primary">
                        恢复
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              </div>
            </div>
          ))}
        </Space>
        {preview && (
          <Card size="small" style={{ marginTop: 18, background: "#f8fbff" }}>
            <Typography.Text strong>版本 {preview.version} 预览</Typography.Text>
            <Typography.Text type="secondary" style={{ display: "block", marginTop: 4 }}>
              {preview.gridRows} 行 × {preview.gridCols} 列
            </Typography.Text>
            <Space wrap size={[6, 6]} style={{ marginTop: 12 }}>
              {preview.seats.map((seat) => (
                <Tag
                  key={seat.id}
                  color={seat.studentId ? "blue" : "default"}
                  style={{ borderRadius: 999 }}
                >
                  {formatSeat(seat.row, seat.col)} ·{" "}
                  {seat.studentId
                    ? studentById.get(seat.studentId)?.name ?? "历史学生"
                    : "空"}
                </Tag>
              ))}
            </Space>
          </Card>
        )}
      </Drawer>
    </div>
  );
}
