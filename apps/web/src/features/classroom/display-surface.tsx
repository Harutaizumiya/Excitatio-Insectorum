"use client";

import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { App as AntApp } from "antd";
import { ArrowUpOutlined, CrownOutlined, MinusOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button } from "@/components/motion/button";
import { useClassroomService, useRealtimeClient } from "@/components/providers/classroom-system-provider";
import { ClassroomServiceError } from "@/lib/classroom-service";
import { reportUsageEventBestEffort, type ClassEventType, type DisplayBootstrap, type Seat } from "@/lib";
import { clearDisplaySession, getDisplaySession } from "@/lib/session";
import { SeatCell } from "@/features/admin/seating/seat-cell";
import {
  RANDOM_PICK_ANIMATION_DURATION_MS,
  RANDOM_PICK_HOP_COUNT,
  RANDOM_PICK_HOP_INTERVAL_MS,
} from "@/features/classroom/random-pick-animation";
import { DisplayAnnouncement } from "./display-announcement";

type Highlight = { studentId: string; name: string } | null;
type SeatKind = "seat" | "podium" | "corridor";
type DisplayGridCell = { row: number; col: number; rowSpan: number };
type DisplaySeatSnapshot = DisplayBootstrap["layout"]["seats"][number];
type ScoreFeedback = { delta: number; token: number };

const SEAT_UPDATE_NOTIFICATION_KEY = "display-seat-update";
const SEAT_UPDATE_DURATION = 1800;
const SEAT_UPDATE_TOTAL_DURATION = 3000;
const DISPLAY_HEARTBEAT_INTERVAL_MS = 60_000;

function formatScore(score: number): string {
  return `${score}分`;
}

function formatScoreDelta(delta: number): string {
  return `${delta > 0 ? "+" : ""}${delta}分`;
}

function getSeatKind(row: number, col: number, rows: number, cols: number, cellType?: Seat["cellType"]): SeatKind {
  if (cellType === "aisle") return "corridor";
  if (cellType === "podium") return "podium";
  if (cellType === "empty") return "seat";
  if (rows === 7 && cols === 9 && row === 0 && col === 4) return "podium";
  if (rows === 7 && cols === 9 && row > 0 && (col === 4 || col === 6)) return "corridor";
  return "seat";
}

function getSeatLabel(row: number, col: number, seat: Pick<DisplaySeatSnapshot, "student" | "cellType"> | undefined, kind: SeatKind): string {
  if (kind === "podium") return "讲台";
  if (kind === "corridor") return "走廊";
  if (seat?.student) return seat.student.name;
  if (row === 0) return "空位";
  return String(row + 1) + "-" + String(col + 1);
}

function FlipFlapLabel({
  value,
  targetValue = value,
  trigger,
  delay = 0,
  scrambleChars,
  active,
}: {
  value: string;
  targetValue?: string;
  trigger: number;
  delay?: number;
  scrambleChars: string[];
  active: boolean;
}): React.ReactElement {
  const [displayedValue, setDisplayedValue] = useState(value);
  const [isFlipping, setIsFlipping] = useState(false);
  const handledTriggerRef = useRef(trigger);

  useEffect(() => {
    if (!active) {
      setIsFlipping(false);
      setDisplayedValue(value);
      return;
    }
    if (trigger === handledTriggerRef.current) {
      setDisplayedValue(value);
      return;
    }
    handledTriggerRef.current = trigger;

    let scrambleTimer: number | undefined;
    let targetTimer: number | undefined;
    let finishTimer: number | undefined;
    const scrambleDuration = SEAT_UPDATE_DURATION;
    const scrambleInterval = 72;
    const nextValue = targetValue;

    const startTimer = window.setTimeout(() => {
      setIsFlipping(true);
      const createScrambledName = () => {
        if (scrambleChars.length === 0) return value;
        const scrambleLength = 2 + Math.floor(Math.random() * 2);
        return Array.from({ length: scrambleLength }, () =>
          scrambleChars[Math.floor(Math.random() * scrambleChars.length)]
        ).join("");
      };
      setDisplayedValue(createScrambledName());
      scrambleTimer = window.setInterval(() => {
        setDisplayedValue(createScrambledName());
      }, scrambleInterval);

      targetTimer = window.setTimeout(() => {
        if (scrambleTimer !== undefined) window.clearInterval(scrambleTimer);
        scrambleTimer = undefined;
        setDisplayedValue(nextValue);
      }, scrambleDuration / 2);

      finishTimer = window.setTimeout(() => {
        setIsFlipping(false);
      }, scrambleDuration);
    }, delay);
    return () => {
      window.clearTimeout(startTimer);
      if (scrambleTimer !== undefined) window.clearInterval(scrambleTimer);
      if (targetTimer !== undefined) window.clearTimeout(targetTimer);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, [active, delay, scrambleChars, targetValue, trigger, value]);

  return (
    <span
      className="display-name-flap"
      data-display-name-flap
      data-flipping={isFlipping ? "true" : "false"}
    >
      {displayedValue}
    </span>
  );
}

function CourseTimeline({ schedule }: { schedule: DisplayBootstrap["schedule"] }): React.ReactElement | null {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  const weekday = now.getDay() === 0 ? 7 : now.getDay()
  const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  const periods = new Map(schedule.periods.map((period) => [period.periodNo, period]))
  const courses = schedule.entries
    .filter((entry) => entry.weekday === weekday)
    .sort((left, right) => left.periodNo - right.periodNo)
    .map((entry) => {
      const period = periods.get(entry.periodNo)
      const toMinutes = (value: string) => {
        const [hour, minute] = value.split(":").map(Number)
        return hour * 60 + minute
      }
      const startMinutes = period ? toMinutes(period.startTime) : 0
      const endMinutes = period ? toMinutes(period.endTime) : 0
      const active = period ? currentMinutes >= startMinutes && currentMinutes < endMinutes : false
      const completed = period ? currentMinutes >= endMinutes : false
      const progress = active && endMinutes > startMinutes
        ? Math.min(100, Math.max(0, ((currentMinutes - startMinutes) / (endMinutes - startMinutes)) * 100))
        : 0
      return { ...entry, active, completed, progress }
    })
  if (courses.length === 0) return null
  return (
    <div className="display-surface__course-timeline flex h-[26px] w-max min-w-0 shrink-0 items-center gap-[6px] overflow-x-auto whitespace-nowrap">
      <span className="shrink-0 text-[11px] leading-4 text-[#8c8c8c]">今日课程：</span>
      {courses.map((course) => {
        const active = course.active
        const completed = course.completed
        return (
          <div
            key={`${course.weekday}-${course.periodNo}`}
            role={active ? "progressbar" : undefined}
            aria-label={active ? `${course.courseName}进行中` : undefined}
            aria-valuemin={active ? 0 : undefined}
            aria-valuemax={active ? 100 : undefined}
            aria-valuenow={active ? Math.round(course.progress) : undefined}
            title={active ? `已进行 ${Math.round(course.progress)}%` : undefined}
            className={
              active
                ? "relative flex h-[26px] min-w-[95px] shrink-0 items-center justify-center overflow-hidden rounded-[6px] border-[1.5px] border-[#1677ff] bg-[#e6f4ff] px-[10px] text-[12px] font-bold text-[#0958d9] shadow-[0_1px_4px_rgba(22,119,255,0.15)]"
                : completed
                  ? "flex size-[26px] shrink-0 items-center justify-center rounded-[6px] border border-[#e4e7ec] bg-[#f0f2f5] text-[11px] text-[#a0a6b2]"
                  : "flex size-[26px] shrink-0 items-center justify-center rounded-[6px] border border-[#d9dce3] bg-white text-[11px] font-bold text-[#595959]"
            }
          >
            {active ? (
              <>
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-[#bae0ff] transition-[width] duration-1000 ease-linear"
                  style={{ width: `${course.progress}%` }}
                />
                <span className="relative z-[1]">{course.courseName} (进行中)</span>
              </>
            ) : course.courseName.slice(0, 1)}
          </div>
        );
      })}
    </div>
  );
}

function DisplaySeat({
  row,
  col,
  seat,
  kind,
  highlighted,
  nameAnimationTrigger,
  nameAnimationDelay,
  scrambleChars,
  nameAnimationTarget,
  animateName,
  rowSpan,
  scoreFeedback,
  scoreFeedbackKey,
}: {
  row: number;
  col: number;
  seat: DisplaySeatSnapshot | undefined;
  kind: SeatKind;
  highlighted: boolean;
  nameAnimationTrigger: number;
  nameAnimationDelay: number;
  scrambleChars: string[];
  nameAnimationTarget?: string;
  animateName: boolean;
  rowSpan: number;
  scoreFeedback?: number;
  scoreFeedbackKey?: number;
}): React.ReactElement {
  const label = getSeatLabel(row, col, seat, kind);
  const isCorridor = kind === "corridor";
  const isMergedCorridor = kind === "corridor" && rowSpan > 1;
  const adminSeat = seat
    ? {
        id: `display-${row}-${col}`,
        row,
        col,
        cellType: seat.cellType,
        studentId: seat.student?.id ?? null,
      }
    : undefined;
  const adminStudent = seat?.student
    ? { id: seat.student.id, name: seat.student.name, studentNo: "" }
    : undefined;

  return (
    <motion.div
      role="img"
      aria-label={label}
      data-display-random-highlight={highlighted ? "true" : "false"}
      initial={false}
      animate={{ scale: highlighted ? 1.08 : 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`relative ${isMergedCorridor ? "h-full" : "h-20"} ${isCorridor ? "w-16" : "w-24"} shrink-0 text-center`}
      style={{
        gridColumn: col + 1,
        gridRow: `${row + 1} / span ${rowSpan}`,
        justifySelf: isCorridor ? "center" : "stretch",
        marginInline: isCorridor ? 4 : 0,
        boxShadow: highlighted
          ? "0 6px 18px rgba(10, 89, 247, 0.35)"
          : "none",
      }}
    >
      <SeatCell
        row={row}
        col={col}
        seat={adminSeat}
        student={adminStudent}
        isLayoutStage={false}
        readOnly
        emphasized={false}
        height={isMergedCorridor ? "100%" : undefined}
        showSeatNumber={false}
        studentContent={
          <div className="relative flex min-h-0 w-full flex-1 items-center justify-center px-1 pt-3 text-center">
            <span className="max-w-full truncate text-[18px] font-extrabold leading-tight text-[#14233c]">
              <FlipFlapLabel
                value={label}
                targetValue={nameAnimationTarget ?? label}
                trigger={nameAnimationTrigger}
                delay={nameAnimationDelay}
                scrambleChars={scrambleChars}
                active={animateName}
              />
            </span>
            {seat?.student ? (
              <span className="absolute right-0 top-0 rounded-full border border-[#d6e4ff] bg-[#f0f5ff] px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums text-[#0958d9]">
                {formatScore(seat.student.score)}
              </span>
            ) : null}
            {typeof scoreFeedback === "number" ? (
              <motion.span
                key={scoreFeedbackKey}
                initial={{ opacity: 0, y: 6, scale: 0.8 }}
                animate={{ opacity: 1, y: -12, scale: 1 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className={`pointer-events-none absolute right-0 -top-1 rounded-full px-1.5 py-1 text-[11px] font-extrabold leading-none shadow-sm ${
                  scoreFeedback > 0
                    ? "bg-[#f6ffed] text-[#389e0d]"
                    : "bg-[#fff1f0] text-[#cf1322]"
                }`}
              >
                {formatScoreDelta(scoreFeedback)}
              </motion.span>
            ) : null}
          </div>
        }
      />
      {highlighted && seat?.student ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[14px] border-2 border-[#0a59f7] bg-[#0a59f7] px-1.5 text-center"
          data-display-random-highlight-card
        >
          <span className="max-w-full truncate text-[13px] font-bold leading-[1.2] text-white">
            {seat.student.name}
          </span>
        </div>
      ) : null}
    </motion.div>
  );
}

function SeatMatrix({
  data,
  highlight,
  zoom,
  offset,
  onOffsetChange,
  onZoomChange,
  isDragging,
  setIsDragging,
  nameAnimationTrigger,
  nameAnimationTargets,
  scoreFeedbacks,
  }: {
  data: DisplayBootstrap;
  highlight: Highlight;
  zoom: number;
  offset: { x: number; y: number };
  onOffsetChange: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  onZoomChange: React.Dispatch<React.SetStateAction<number>>;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  nameAnimationTrigger: number;
  nameAnimationTargets: Map<string, string>;
  scoreFeedbacks: Map<string, ScoreFeedback>;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pinchStartRef = useRef<{ distance: number; initialZoom: number } | null>(null);
  const scrambleChars = useMemo(
    () => Array.from(
      new Set(
        data.layout.seats
          .flatMap((seat) => (seat.student?.name ? Array.from(seat.student.name) : []))
          .filter((char) => char.trim().length > 0)
      )
    ),
    [data.layout.seats]
  );
  const seatLookup = useMemo(
    () => new Map(data.layout.seats.map((seat) => [String(seat.row) + "-" + String(seat.col), seat])),
    [data.layout.seats]
  );
  const cells = useMemo<DisplayGridCell[]>(() => {
    const rows = data.classroom.gridRows;
    const cols = data.classroom.gridCols;
    const mergedCorridorCells = new Set<string>();
    const nextCells: DisplayGridCell[] = [];

    const kindAt = (row: number, col: number) => {
      const seat = seatLookup.get(`${row}-${col}`);
      return getSeatKind(row, col, rows, cols, seat?.cellType);
    };

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const key = `${row}-${col}`;
        if (mergedCorridorCells.has(key)) continue;

        if (kindAt(row, col) !== "corridor") {
          nextCells.push({ row, col, rowSpan: 1 });
          continue;
        }

        let rowSpan = 1;
        while (row + rowSpan < rows && kindAt(row + rowSpan, col) === "corridor") {
          mergedCorridorCells.add(`${row + rowSpan}-${col}`);
          rowSpan += 1;
        }
        nextCells.push({ row, col, rowSpan });
      }
    }

    return nextCells;
  }, [data.classroom.gridCols, data.classroom.gridRows, seatLookup]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    onOffsetChange({
      x: Math.round(dragStartRef.current.originX + dx),
      y: Math.round(dragStartRef.current.originY + dy),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture release fallback
      }
      dragStartRef.current = null;
      setIsDragging(false);
    }
  };

  // Multi-touch pinch-to-zoom support for interactive touchscreens / smart boards
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      pinchStartRef.current = {
        distance: dist,
        initialZoom: zoom,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (pinchStartRef.current && e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (pinchStartRef.current.distance > 0) {
        const ratio = dist / pinchStartRef.current.distance;
        const nextZoom = Math.min(
          160,
          Math.max(60, Math.round((pinchStartRef.current.initialZoom * ratio) / 5) * 5)
        );
        onZoomChange(nextZoom);
      }
    }
  };

  const handleTouchEnd = () => {
    pinchStartRef.current = null;
  };

  // Mouse wheel zoom or trackpad pan
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 5 : -5;
      onZoomChange((z) => Math.min(160, Math.max(60, z + delta)));
    } else {
      onOffsetChange((prev) => ({
        x: Math.round(prev.x - e.deltaX),
        y: Math.round(prev.y - e.deltaY),
      }));
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      className={`absolute inset-0 h-full w-full overflow-hidden select-none touch-none ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      style={{
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      <div
        className="flex h-full w-full items-center justify-center will-change-transform pr-[300px] pl-6 pt-8"
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom / 100})`,
          transformOrigin: "center center",
          transition: isDragging ? "none" : "transform 0.15s ease-out",
        }}
      >
        <div
          className="grid min-w-[1030px]"
          style={{
            gridTemplateColumns: "repeat(" + String(data.classroom.gridCols) + ", 96px)",
            gridTemplateRows: "repeat(" + String(data.classroom.gridRows) + ", 80px)",
            columnGap: 0,
            rowGap: 16,
            justifyContent: "space-between",
          }}
        >
          {cells.map((cell) => {
            const seat = seatLookup.get(String(cell.row) + "-" + String(cell.col));
            const kind = getSeatKind(cell.row, cell.col, data.classroom.gridRows, data.classroom.gridCols, seat?.cellType);
            const studentId = seat?.student?.id;
            return (
              <DisplaySeat
                key={String(cell.row) + "-" + String(cell.col)}
                row={cell.row}
                col={cell.col}
                seat={seat}
                kind={kind}
                highlighted={Boolean(highlight && studentId === highlight.studentId)}
                nameAnimationTrigger={nameAnimationTrigger}
                nameAnimationDelay={cell.row * 120}
                scrambleChars={scrambleChars}
                nameAnimationTarget={nameAnimationTargets.get(`${cell.row}-${cell.col}`)}
                animateName={nameAnimationTargets.has(`${cell.row}-${cell.col}`)}
                rowSpan={cell.rowSpan}
                scoreFeedback={studentId ? scoreFeedbacks.get(studentId)?.delta : undefined}
                scoreFeedbackKey={studentId ? scoreFeedbacks.get(studentId)?.token : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ZoomController({
  zoom,
  onChange,
  onReset,
  isPannedOrZoomed,
}: {
  zoom: number;
  onChange: (value: number) => void;
  onReset: () => void;
  isPannedOrZoomed: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 items-center gap-[10px] rounded-[20px] border border-[#e2e4ea] bg-white/95 px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md select-none">
        <Button
          variant="ghost"
          size="icon"
          aria-label="缩小座位图"
          onClick={() => onChange(Math.max(60, zoom - 10))}
          className="h-6 w-6 rounded-full p-0 text-[#595959] hover:bg-[#f0f2f5] hover:text-[#1677ff] active:scale-95"
        >
          <MinusOutlined className="text-[12px]" aria-hidden="true" />
        </Button>
        <span className="w-[42px] text-center text-[13px] font-bold tabular-nums text-[#1f1f1f]">
          {zoom}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="放大座位图"
          onClick={() => onChange(Math.min(160, zoom + 10))}
          className="h-6 w-6 rounded-full p-0 text-[#595959] hover:bg-[#f0f2f5] hover:text-[#1677ff] active:scale-95"
        >
          <PlusOutlined className="text-[12px]" aria-hidden="true" />
        </Button>
      </div>

      {isPannedOrZoomed ? (
        <Button
          variant="outline"
          onClick={onReset}
          className="h-9 rounded-[20px] border-[#d9dce3] bg-white/95 px-3 text-xs font-semibold text-[#595959] shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md hover:border-[#1677ff] hover:text-[#1677ff] active:scale-95"
        >
          <ReloadOutlined className="mr-1 text-[11px]" />
          复位
        </Button>
      ) : null}

      <span className="hidden text-xs text-[#8c93a3] lg:inline-block">
        👆 支持触屏单指拖动、双指缩放
      </span>
    </div>
  );
}

function Avatar({ rank }: { rank: 1 | 2 | 3 }): React.ReactElement {
  const first = rank === 1;
  const third = rank === 3;
  const imageSize = first ? 64 : 54;
  const imageSource = `${import.meta.env.BASE_URL}top${rank}.png`;
  return (
    <div
      className={
        first
          ? "flex size-[64px] shrink-0 aspect-square items-center justify-center overflow-hidden rounded-full border-[3px] border-[#faad14] bg-[#fffbe6] text-[#d48806] shadow-[0_4px_12px_rgba(250,173,20,0.4)]"
          : third
            ? "flex size-[54px] shrink-0 aspect-square items-center justify-center overflow-hidden rounded-full border-[2.5px] border-[#ffbb96] bg-[#fff2e8] text-[#d4380d] shadow-[0_3px_8px_rgba(212,56,13,0.15)]"
            : "flex size-[54px] shrink-0 aspect-square items-center justify-center overflow-hidden rounded-full border-[2.5px] border-[#adc6ff] bg-[#f5f7fa] text-[#597ef7] shadow-[0_3px_8px_rgba(22,119,255,0.18)]"
      }
    >
      <img
        src={imageSource}
        alt=""
        width={imageSize}
        height={imageSize}
        className="block size-full aspect-square rounded-full object-cover"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

function TopRankPanel({ ranking }: { ranking: DisplayBootstrap["ranking"] }): React.ReactElement {
  const top3 = ranking.top3.slice(0, 3);
  return (
    <section className="flex h-[268px] shrink-0 w-full flex-col gap-3 rounded-2xl border border-[#e2e4ea] bg-white/95 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-md">
      <div className="flex h-[22px] w-full items-center justify-between">
        <h2 className="text-base font-bold text-[#1f1f1f]">课堂表现 TOP 榜</h2>
      </div>
      {top3.length ? (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 px-0 py-1">
          {top3[0] ? (
            <div className="flex h-[112px] flex-col items-center gap-[2px]">
              <CrownOutlined className="text-[18px] text-[#faad14]" aria-hidden="true" />
              <Avatar rank={1} />
              <span className="text-sm font-bold text-[#1f1f1f]">{top3[0].name}</span>
              <span className="rounded-full bg-[#fff7e6] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#d46b08]">
                {formatScore(top3[0].score)}
              </span>
            </div>
          ) : null}
          <div className="flex h-[74px] w-full items-center justify-center gap-[44px]">
            {top3[1] ? (
              <div className="flex h-[74px] w-20 flex-col items-center gap-[2px]">
                <Avatar rank={2} />
                <span className="text-xs font-bold text-[#1f1f1f]">{top3[1].name}</span>
                <span className="text-[11px] font-bold tabular-nums text-[#d46b08]">{formatScore(top3[1].score)}</span>
              </div>
            ) : <div className="w-20" />}
            {top3[2] ? (
              <div className="flex h-[74px] w-20 flex-col items-center gap-[2px]">
                <Avatar rank={3} />
                <span className="text-xs font-bold text-[#1f1f1f]">{top3[2].name}</span>
                <span className="text-[11px] font-bold tabular-nums text-[#d46b08]">{formatScore(top3[2].score)}</span>
              </div>
            ) : <div className="w-20" />}
          </div>
        </div>
      ) : <div className="flex flex-1 items-center justify-center text-sm text-[#8c8c8c]">暂无排名数据</div>}
    </section>
  );
}

function ProgressPanel({ ranking }: { ranking: DisplayBootstrap["ranking"] }): React.ReactElement {
  return (
    <section className="flex shrink-0 w-full flex-col gap-3 rounded-2xl border border-[#e2e4ea] bg-white/95 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-md">
      <div className="flex h-5 w-full items-center justify-between">
        <h2 className="text-sm font-bold text-[#1f1f1f]">进步跃升榜 (较上周)</h2>
      </div>
      {ranking.progress.length ? (
        <div className="flex w-full flex-col gap-1.5">
          {ranking.progress.slice(0, 10).map((item, index) => (
            <div key={item.studentId} className="flex h-9 w-full items-center justify-between rounded-lg border border-[#f0f0f0] bg-[#fafafa] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tabular-nums text-[#8c8c8c]">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-[13px] font-bold text-[#1f1f1f]">{item.name}</span>
              </div>
              <div className="flex h-5 items-center gap-1.5 rounded border border-[#b7eb8f] bg-[#f6ffed] px-1.5 py-0.5 text-[11px] font-bold text-[#52c41a]">
                <ArrowUpOutlined className="text-[11px]" aria-hidden="true" />
                <span>{Math.abs(item.change)} 名</span>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="flex flex-1 items-center justify-center text-sm text-[#8c8c8c]">暂无进步数据</div>}
    </section>
  );
}

export function DisplaySurface(): React.ReactElement {
  const navigate = useNavigate();
  const service = useClassroomService();
  const realtime = useRealtimeClient();
  const [data, setData] = useState<DisplayBootstrap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Highlight>(null);
  const [scoreFeedbacks, setScoreFeedbacks] = useState<Map<string, ScoreFeedback>>(new Map());
  const [zoom, setZoom] = useState(100);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [nameAnimationTrigger, setNameAnimationTrigger] = useState(0);
  const [nameAnimationTargets, setNameAnimationTargets] = useState<Map<string, string>>(new Map());
  const highlightTimer = useRef<number | null>(null);
  const randomPickMarqueeTimer = useRef<number | null>(null);
  const randomPickSettleTimer = useRef<number | null>(null);
  const seatUpdateTimer = useRef<number | null>(null);
  const scoreFeedbackTimerRef = useRef<number | null>(null);
  const announcementActiveRef = useRef(false);
  const announcementViewRef = useRef<{ zoom: number; offset: { x: number; y: number } } | null>(null);
  const seatUpdatePendingRef = useRef(false);
  const dataRef = useRef<DisplayBootstrap | null>(null);
  dataRef.current = data;
  const { notification } = AntApp.useApp();

  useEffect(() => {
    const session = getDisplaySession();
    if (!session) {
      navigate("/display/bind", { replace: true });
      return;
    }

    let stopped = false;
    let startupReported = false;
    const reportDisplayEvent = (
      eventName: string,
      result: "SUCCESS" | "FAILURE" = "SUCCESS",
      module = "runtime",
      errorCode?: string,
    ) => {
      void reportUsageEventBestEffort(
        (input, options) => service.reportUsageEvent(input, options),
        {
          eventName,
          clientType: "DISPLAY",
          result,
          module,
          page: window.location.pathname,
          appVersion: import.meta.env.VITE_APP_VERSION || "web",
          browser: navigator.userAgent,
          errorCode,
        },
        { auth: "display" },
      );
    };
    const refresh = async () => {
      try {
        const next = await service.getDisplayBootstrap(session.deviceId);
        if (!stopped) {
          setData(next);
          setLoadError(null);
          if (!startupReported) {
            startupReported = true;
            reportDisplayEvent("display.started", "SUCCESS", "display");
          }
        }
      } catch (error) {
        if (stopped) return;
        if (error instanceof ClassroomServiceError && error.status === 401) {
          clearDisplaySession();
          navigate("/display/bind", { replace: true });
          return;
        }
        reportDisplayEvent(
          "display.load_failed",
          "FAILURE",
          "display",
          error instanceof ClassroomServiceError ? error.code : "DISPLAY_LOAD_FAILED",
        );
        setLoadError(error instanceof Error ? error.message : "大屏数据加载失败");
      }
    };

    const showScoreFeedback = (studentId: string, delta: number) => {
      const token = Date.now();
      setScoreFeedbacks((current) => new Map(current).set(studentId, { delta, token }));
      if (scoreFeedbackTimerRef.current !== null) {
        window.clearTimeout(scoreFeedbackTimerRef.current);
      }
      scoreFeedbackTimerRef.current = window.setTimeout(() => {
        setScoreFeedbacks(new Map());
        scoreFeedbackTimerRef.current = null;
      }, 1600);
    };

    const refreshAfterSeatAnimation = async () => {
      try {
        // Fetch the new names first, but keep the old layout rendered until the
        // flip sequence has finished. This lets names change during the flip
        // instead of appearing only after the seats move.
        const next = await service.getDisplayBootstrap(session.deviceId);
        if (stopped) return;

        const current = dataRef.current;
        if (!current) return;
        const currentSeatLookup = new Map(
          current.layout.seats.map((seat) => [`${seat.row}-${seat.col}`, seat]),
        );
        const nextSeatLookup = new Map(
          next.layout.seats.map((seat) => [`${seat.row}-${seat.col}`, seat]),
        );
        const nextNames = new Map<string, string>();
        for (let row = 0; row < current.classroom.gridRows; row += 1) {
          for (let col = 0; col < current.classroom.gridCols; col += 1) {
            const key = `${row}-${col}`;
            const currentSeat = currentSeatLookup.get(key);
            const nextSeat = nextSeatLookup.get(key);
            const currentKind = getSeatKind(
              row,
              col,
              current.classroom.gridRows,
              current.classroom.gridCols,
              currentSeat?.cellType,
            );
            const nextKind = getSeatKind(
              row,
              col,
              next.classroom.gridRows,
              next.classroom.gridCols,
              nextSeat?.cellType,
            );
            const currentLabel = getSeatLabel(row, col, currentSeat, currentKind);
            const nextLabel = getSeatLabel(row, col, nextSeat, nextKind);
            if (currentLabel !== nextLabel) nextNames.set(key, nextLabel);
          }
        }
        seatUpdatePendingRef.current = true;
        setNameAnimationTargets(nextNames);
        setNameAnimationTrigger((trigger) => trigger + 1);
      notification.open({
        key: SEAT_UPDATE_NOTIFICATION_KEY,
        title: "正在更新座位",
        description: "座位信息即将完成更新",
        duration: 0,
        placement: "top",
      });
        if (seatUpdateTimer.current !== null) window.clearTimeout(seatUpdateTimer.current);
        seatUpdateTimer.current = window.setTimeout(() => {
          if (stopped) return;
          setData(next);
          setNameAnimationTargets(new Map());
          seatUpdatePendingRef.current = false;
          notification.destroy(SEAT_UPDATE_NOTIFICATION_KEY);
        }, SEAT_UPDATE_TOTAL_DURATION);
      } catch (error) {
        if (stopped) return;
        if (error instanceof ClassroomServiceError && error.status === 401) {
          clearDisplaySession();
          navigate("/display/bind", { replace: true });
          return;
        }
        setLoadError(error instanceof Error ? error.message : "大屏数据加载失败");
      }
    };

    void refresh();
    const heartbeatTimer = window.setInterval(() => {
      if (startupReported && document.visibilityState === "visible") {
        reportDisplayEvent("display.heartbeat");
      }
    }, DISPLAY_HEARTBEAT_INTERVAL_MS);
    let lastRealtimeStatus = realtime.getStatus();
    const unsubscribeRealtimeStatus = realtime.subscribeStatus((status) => {
      const reconnected = status === "CONNECTED" && lastRealtimeStatus !== "CONNECTED";
      const disconnected = status === "DISCONNECTED" && lastRealtimeStatus !== "DISCONNECTED";
      lastRealtimeStatus = status;
      if (reconnected) void refresh();
      if (disconnected) {
        reportDisplayEvent(
          "display.realtime_disconnected",
          "FAILURE",
          "realtime",
          "REALTIME_DISCONNECTED",
        );
      }
    });
    const subscriptions = [
      realtime.subscribe("SCORE_CHANGED", session.classId, (event) => {
        if (event.payload.studentId && typeof event.payload.delta === "number" && event.payload.delta !== 0) {
          showScoreFeedback(event.payload.studentId, event.payload.delta);
        }
        void refresh();
      }),
      realtime.subscribe("SCORE_REVERTED", session.classId, (event) => {
        showScoreFeedback(event.payload.studentId, event.payload.delta);
        void refresh();
      }),
      ...(['RANKING_CHANGED', 'DISPLAY_CONFIG_CHANGED', 'SCHEDULE_CHANGED'] as ClassEventType[])
        .map((type) => realtime.subscribe(type, session.classId, () => void refresh())),
    ];
    subscriptions.push(
      realtime.subscribe("SEAT_LAYOUT_CHANGED", session.classId, () => void refreshAfterSeatAnimation()),
      realtime.subscribe("STUDENT_CHANGED", session.classId, () => void refreshAfterSeatAnimation()),
    );
    subscriptions.push(
      realtime.subscribe("RANDOM_PICKED", session.classId, (event) => {
        if (announcementActiveRef.current) return;
        if (randomPickMarqueeTimer.current !== null) {
          window.clearInterval(randomPickMarqueeTimer.current);
          randomPickMarqueeTimer.current = null;
        }
        if (randomPickSettleTimer.current !== null) {
          window.clearTimeout(randomPickSettleTimer.current);
          randomPickSettleTimer.current = null;
        }
        if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);

        const occupiedStudents = (dataRef.current?.layout.seats ?? [])
          .flatMap((seat) => (seat.student ? [seat.student] : []));
        const selectedStudent = {
          studentId: event.payload.studentId,
          name: event.payload.name,
        };

        if (occupiedStudents.length === 0) {
          setHighlight(selectedStudent);
          highlightTimer.current = window.setTimeout(
            () => setHighlight(null),
            Math.max(2000, event.payload.displayDurationMs),
          );
          void refresh();
          return;
        }

        let hopCount = 0;
        randomPickMarqueeTimer.current = window.setInterval(() => {
          hopCount += 1;
          const student = occupiedStudents[
            Math.floor(Math.random() * occupiedStudents.length)
          ];
          if (student) {
            setHighlight({ studentId: student.id, name: student.name });
          }
          if (hopCount >= RANDOM_PICK_HOP_COUNT) {
            if (randomPickMarqueeTimer.current !== null) {
              window.clearInterval(randomPickMarqueeTimer.current);
              randomPickMarqueeTimer.current = null;
            }
          }
        }, RANDOM_PICK_HOP_INTERVAL_MS);

        randomPickSettleTimer.current = window.setTimeout(() => {
          if (stopped) return;
          if (randomPickMarqueeTimer.current !== null) {
            window.clearInterval(randomPickMarqueeTimer.current);
            randomPickMarqueeTimer.current = null;
          }
          setHighlight(selectedStudent);
          randomPickSettleTimer.current = null;
          highlightTimer.current = window.setTimeout(
            () => setHighlight(null),
            Math.max(2000, event.payload.displayDurationMs),
          );
        }, RANDOM_PICK_ANIMATION_DURATION_MS);
        void refresh();
      }),
      realtime.subscribe("TEACHER_CONNECTED", session.classId, (event) => {
        notification.open({
          title: `${event.payload.teacherName}老师已连接`,
          placement: "top",
        });
      }),
    );

    return () => {
      stopped = true;
      window.clearInterval(heartbeatTimer);
      unsubscribeRealtimeStatus();
      subscriptions.forEach((unsubscribe) => unsubscribe());
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
      if (randomPickMarqueeTimer.current !== null) window.clearInterval(randomPickMarqueeTimer.current);
      if (randomPickSettleTimer.current !== null) window.clearTimeout(randomPickSettleTimer.current);
      if (seatUpdateTimer.current !== null) window.clearTimeout(seatUpdateTimer.current);
      if (scoreFeedbackTimerRef.current !== null) window.clearTimeout(scoreFeedbackTimerRef.current);
      scoreFeedbackTimerRef.current = null;
      setScoreFeedbacks(new Map());
      seatUpdatePendingRef.current = false;
      notification.destroy(SEAT_UPDATE_NOTIFICATION_KEY);
    };
  }, [navigate, notification, realtime, service]);

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f5f8] text-sm text-[#667085]">
        {loadError ?? "正在加载班级大屏…"}
      </main>
    );
  }

  const highlightedStudent = highlight && !data.layout.seats.some((seat) => seat.student?.id === highlight.studentId) ? highlight : null;

  return (
    <main
      className="relative h-screen w-full overflow-hidden bg-[#f4f5f8] text-[#1f1f1f] select-none"
      style={{
        fontFamily: '"Noto Sans SC", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      {/* 1. Fullscreen seating canvas (occupies full screen without margin/padding to browser edges) */}
      <SeatMatrix
        data={data}
        highlight={highlight}
        zoom={zoom}
        offset={offset}
        onOffsetChange={setOffset}
        onZoomChange={setZoom}
        isDragging={isDragging}
        setIsDragging={setIsDragging}
        nameAnimationTrigger={nameAnimationTrigger}
        nameAnimationTargets={nameAnimationTargets}
        scoreFeedbacks={scoreFeedbacks}
      />

      {/* 2. Floating Centered Top Header Bar */}
      <header className="display-surface__header pointer-events-auto absolute top-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3.5 rounded-2xl border border-[#e2e4ea] bg-white/95 px-5 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md">
        <h1 className="display-surface__classroom-name shrink-0 text-[18px] font-bold leading-none text-[#1f1f1f]">{data.classroom.name}</h1>
        <div className="display-surface__header-divider h-4 w-px shrink-0 bg-[#e5e8ee]" />
        <CourseTimeline schedule={data.schedule} />
      </header>

      {/* 3. Floating Bottom-Left Zoom & Reset Controls */}
      <div className="pointer-events-auto absolute bottom-5 left-6 z-10">
        <ZoomController
          zoom={zoom}
          onChange={setZoom}
          onReset={() => {
            setOffset({ x: 0, y: 0 });
            setZoom(100);
          }}
          isPannedOrZoomed={offset.x !== 0 || offset.y !== 0 || zoom !== 100}
        />
      </div>

      {/* 4. Floating Right-Side Ranking Cards (Vertically Centered) */}
      <aside className="pointer-events-auto absolute top-1/2 right-6 -translate-y-1/2 z-10 flex w-[320px] max-h-[calc(100vh-40px)] flex-col gap-3.5 overflow-y-auto">
        <TopRankPanel ranking={data.ranking} />
        <ProgressPanel ranking={data.ranking} />
      </aside>

      {/* 5. Highlight / Random Pick Callout */}
      <AnimatePresence>
        {highlightedStudent ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="pointer-events-none fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full border border-[#91caff] bg-[#e6f4ff] px-4 py-2 text-sm font-bold text-[#1677ff] shadow-lg"
          >
            {highlightedStudent.name} 正在被点名
          </motion.div>
        ) : null}
      </AnimatePresence>
      <DisplayAnnouncement
        data={data}
        activeRef={announcementActiveRef}
        onHighlightStart={(studentId, name, row, col) => {
          if (!announcementViewRef.current) announcementViewRef.current = { zoom, offset };
          if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
          if (randomPickMarqueeTimer.current !== null) window.clearInterval(randomPickMarqueeTimer.current);
          if (randomPickSettleTimer.current !== null) window.clearTimeout(randomPickSettleTimer.current);
          setHighlight({ studentId, name });
          setZoom(100);
          setOffset({
            x: Math.round(((data.classroom.gridCols - 1) / 2 - col) * 96),
            y: Math.round(((data.classroom.gridRows - 1) / 2 - row) * 96),
          });
        }}
        onHighlightEnd={() => setHighlight(null)}
        onFinish={() => {
          setHighlight(null);
          if (announcementViewRef.current) {
            setZoom(announcementViewRef.current.zoom);
            setOffset(announcementViewRef.current.offset);
            announcementViewRef.current = null;
          }
        }}
      />
    </main>
  );
}
