"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpOutlined, CrownOutlined, MinusOutlined, PlusOutlined, ReloadOutlined, UserOutlined } from "@ant-design/icons";
import { Button } from "@/components/motion/button";
import { useClassroomService, useRealtimeClient } from "@/components/providers/classroom-system-provider";
import { ClassroomServiceError } from "@/lib/classroom-service";
import type { ClassEventType, DisplayBootstrap, Seat } from "@/lib";
import { clearDisplaySession, getDisplaySession } from "@/lib/session";

type Highlight = { studentId: string; name: string } | null;
type SeatKind = "seat" | "podium" | "corridor";

const SELECTED_STUDENT_ID = "student-1";

const courses = [
  { label: "语", status: "completed" },
  { label: "英", status: "completed" },
  { label: "物", status: "completed" },
  { label: "数学", status: "active" },
  { label: "化", status: "upcoming" },
  { label: "生", status: "upcoming" },
  { label: "历", status: "upcoming" },
  { label: "自", status: "upcoming" },
] as const;

function getSeatKind(row: number, col: number, rows: number, cols: number, cellType?: Seat["cellType"]): SeatKind {
  if (cellType === "aisle") return "corridor";
  if (cellType === "podium") return "podium";
  if (cellType === "empty") return "seat";
  if (rows === 7 && cols === 9 && row === 0 && col === 4) return "podium";
  if (rows === 7 && cols === 9 && row > 0 && (col === 4 || col === 6)) return "corridor";
  return "seat";
}

function getSeatLabel(row: number, col: number, seat: Pick<Seat, "student" | "cellType"> | undefined, kind: SeatKind): string {
  if (kind === "podium") return "讲台";
  if (kind === "corridor") return "走廊";
  if (seat?.student) return seat.student.name;
  if (row === 0) return "空位";
  return String(row + 1) + "-" + String(col + 1);
}

function CourseTimeline(): React.ReactElement {
  return (
    <div className="flex h-[26px] w-[380px] max-w-full items-center gap-[6px]">
      <span className="shrink-0 text-[11px] leading-4 text-[#8c8c8c]">今日课程：</span>
      {courses.map((course) => {
        const active = course.status === "active";
        const completed = course.status === "completed";
        return (
          <div
            key={course.label}
            className={
              active
                ? "flex h-[26px] min-w-[95px] items-center justify-center rounded-[6px] border-[1.5px] border-[#1677ff] bg-[#e6f4ff] px-[10px] text-[12px] font-bold text-[#0958d9] shadow-[0_1px_4px_rgba(22,119,255,0.15)]"
                : completed
                  ? "flex size-[26px] shrink-0 items-center justify-center rounded-[6px] border border-[#e4e7ec] bg-[#f0f2f5] text-[11px] text-[#a0a6b2]"
                  : "flex size-[26px] shrink-0 items-center justify-center rounded-[6px] border border-[#d9dce3] bg-white text-[11px] font-bold text-[#595959]"
            }
          >
            {active ? "数学 (进行中)" : course.label}
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
  selected,
  highlighted,
}: {
  row: number;
  col: number;
  seat: Pick<Seat, "student" | "cellType"> | undefined;
  kind: SeatKind;
  selected: boolean;
  highlighted: boolean;
}): React.ReactElement {
  const label = getSeatLabel(row, col, seat, kind);
  const occupied = Boolean(seat?.student);
  const emphasized = selected || highlighted;
  const surface =
    kind === "podium"
      ? "border-[#9bb7e2] bg-[#e8eef8] text-[#2f54eb] shadow-[0_2px_6px_rgba(47,84,235,0.08)]"
      : kind === "corridor"
        ? "border-[#d5d9e2] bg-[#eceef2] text-[#8c93a3]"
        : emphasized
          ? "border-[#1677ff] bg-[#f0f5ff] text-[#1677ff] shadow-[0_3px_10px_rgba(22,119,255,0.22)]"
          : row === 0
            ? "border-[#d0d5dd] bg-transparent text-[#98a2b3]"
            : "border-[#d9dce3] bg-white text-[#667085] shadow-[0_1.5px_4px_rgba(0,0,0,0.03)]";

  return (
    <motion.div
      role="img"
      aria-label={label}
      initial={false}
      animate={highlighted ? { scale: [1, 1.04, 1], boxShadow: ["0 0 0 0 rgba(22,119,255,0)", "0 0 0 6px rgba(22,119,255,0.16)", "0 0 0 0 rgba(22,119,255,0)"] } : { scale: 1 }}
      transition={highlighted ? { duration: 1.2, ease: "easeInOut" } : { duration: 0.2 }}
      className={"relative flex h-20 w-24 shrink-0 items-center justify-center rounded-[14px] border text-center " + surface}
      style={{ borderWidth: kind === "seat" && emphasized ? 2.5 : kind === "seat" ? 1.5 : kind === "podium" ? 1.5 : 1 }}
    >
      <span className={kind === "podium" ? "text-base font-bold" : kind === "corridor" ? "text-[13px] font-normal" : occupied ? "text-lg font-bold" : "text-sm font-bold"}>
        {label}
      </span>
      {highlighted ? (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-[4px] border border-[#91caff] bg-[#e6f4ff] px-1.5 py-0.5 text-[10px] font-bold text-[#1677ff]">
          本轮点名
        </span>
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
}: {
  data: DisplayBootstrap;
  highlight: Highlight;
  zoom: number;
  offset: { x: number; y: number };
  onOffsetChange: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  onZoomChange: React.Dispatch<React.SetStateAction<number>>;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pinchStartRef = useRef<{ distance: number; initialZoom: number } | null>(null);

  const seatLookup = useMemo(
    () => new Map(data.layout.seats.map((seat) => [String(seat.row) + "-" + String(seat.col), seat])),
    [data.layout.seats]
  );
  const cells = useMemo(
    () =>
      Array.from({ length: data.classroom.gridRows * data.classroom.gridCols }, (_, index) => ({
        row: Math.floor(index / data.classroom.gridCols),
        col: index % data.classroom.gridCols,
      })),
    [data.classroom.gridCols, data.classroom.gridRows]
  );

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
                selected={studentId === SELECTED_STUDENT_ID}
                highlighted={Boolean(highlight && studentId === highlight.studentId)}
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
  return (
    <div
      className={
        first
          ? "flex size-[64px] items-center justify-center rounded-full border-[3px] border-[#faad14] bg-[#fffbe6] text-[#d48806] shadow-[0_4px_12px_rgba(250,173,20,0.4)]"
          : third
            ? "flex size-[54px] items-center justify-center rounded-full border-[2.5px] border-[#ffbb96] bg-[#fff2e8] text-[#d4380d] shadow-[0_3px_8px_rgba(212,56,13,0.15)]"
            : "flex size-[54px] items-center justify-center rounded-full border-[2.5px] border-[#adc6ff] bg-[#f5f7fa] text-[#597ef7] shadow-[0_3px_8px_rgba(22,119,255,0.18)]"
      }
    >
      <UserOutlined className={first ? "text-[32px]" : "text-[26px]"} aria-hidden="true" />
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
            </div>
          ) : null}
          <div className="flex h-[74px] w-full items-center justify-center gap-[44px]">
            {top3[1] ? (
              <div className="flex h-[74px] w-20 flex-col items-center gap-[2px]">
                <Avatar rank={2} />
                <span className="text-xs font-bold text-[#1f1f1f]">{top3[1].name}</span>
              </div>
            ) : <div className="w-20" />}
            {top3[2] ? (
              <div className="flex h-[74px] w-20 flex-col items-center gap-[2px]">
                <Avatar rank={3} />
                <span className="text-xs font-bold text-[#1f1f1f]">{top3[2].name}</span>
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
  const router = useRouter();
  const service = useClassroomService();
  const realtime = useRealtimeClient();
  const [data, setData] = useState<DisplayBootstrap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Highlight>(null);
  const [zoom, setZoom] = useState(100);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const highlightTimer = useRef<number | null>(null);

  useEffect(() => {
    const session = getDisplaySession();
    if (!session) {
      router.replace("/display/bind");
      return;
    }

    let stopped = false;
    const refresh = async () => {
      try {
        const next = await service.getDisplayBootstrap(session.deviceId);
        if (!stopped) {
          setData(next);
          setLoadError(null);
        }
      } catch (error) {
        if (stopped) return;
        if (error instanceof ClassroomServiceError && error.status === 401) {
          clearDisplaySession();
          router.replace("/display/bind");
          return;
        }
        setLoadError(error instanceof Error ? error.message : "大屏数据加载失败");
      }
    };

    void refresh();
    const subscriptions = (['SCORE_CHANGED', 'SCORE_REVERTED', 'RANKING_CHANGED', 'SEAT_LAYOUT_CHANGED', 'STUDENT_CHANGED', 'DISPLAY_CONFIG_CHANGED'] as ClassEventType[])
      .map((type) => realtime.subscribe(type, session.classId, () => void refresh()));
    subscriptions.push(
      realtime.subscribe("RANDOM_PICKED", session.classId, (event) => {
        setHighlight({ studentId: event.payload.studentId, name: event.payload.name });
        if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
        highlightTimer.current = window.setTimeout(() => setHighlight(null), Math.max(2000, event.payload.displayDurationMs));
        void refresh();
      }),
    );

    return () => {
      stopped = true;
      subscriptions.forEach((unsubscribe) => unsubscribe());
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    };
  }, [realtime, router, service]);

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
      className="relative h-screen w-screen overflow-hidden bg-[#f4f5f8] text-[#1f1f1f] select-none"
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
      />

      {/* 2. Floating Centered Top Header Bar */}
      <header className="pointer-events-auto absolute top-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3.5 rounded-2xl border border-[#e2e4ea] bg-white/95 px-5 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md">
        <Image
          src="/logo.png"
          alt="课序 Logo"
          width={28}
          height={28}
          className="size-7 rounded-lg shadow-sm"
          priority
        />
        <h1 className="text-[18px] font-bold leading-none text-[#1f1f1f]">{data.classroom.name}</h1>
        <div className="h-4 w-px bg-[#e5e8ee]" />
        <CourseTimeline />
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
    </main>
  );
}
