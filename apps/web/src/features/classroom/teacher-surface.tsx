"use client";

import {
  ArrowLeftOutlined,
  CloseOutlined,
  EditOutlined,
  HistoryOutlined,
  SearchOutlined,
  ThunderboltFilled,
  ThunderboltOutlined,
  UndoOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  App as AntApp,
  Avatar,
  Button,
  Card,
  Checkbox,
  ConfigProvider,
  Descriptions,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Select,
  Spin,
  Tag,
  Typography,
} from "antd";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
} from "react";
import {
  useClassroom,
  useCreateScoreEvent,
  useRandomPick,
  useRevertScore,
  useScoreRecords,
  useSeatLayout,
  useStudents,
} from "@/components/providers/query-hooks";
import { useRealtimeClient } from "@/components/providers/classroom-system-provider";
import { useRealtimeStatus } from "@/components/providers/realtime-hooks";
import type { CreateScoreEventInput, ScoreRecord, Seat, Student } from "@/lib";
import { getActiveClassId, getUserSession } from "@/lib/session";
import { classroomRealtime } from "./classroom-realtime";

function formatTime(date: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return date;
  }
}

function formatDelta(delta: number): string {
  return `${delta > 0 ? "+" : ""}${delta}`;
}

function subscribeToTeacherSession(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("classroom-auth-changed", onStoreChange);
  return () => window.removeEventListener("classroom-auth-changed", onStoreChange);
}

function getTeacherNameSnapshot(): string {
  return getUserSession()?.user.name ?? "任课教师";
}

function getServerTeacherNameSnapshot(): string {
  return "任课教师";
}

export function TeacherSurface(): ReactElement {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#0a59f7",
          colorInfo: "#0a59f7",
          colorBgLayout: "#f3f6fb",
          colorBorderSecondary: "#e7edf5",
          borderRadius: 12,
          fontFamily: '"Inter", "Noto Sans TC", Arial, sans-serif',
        },
        components: {
          Button: { borderRadius: 999 },
          Card: { borderRadiusLG: 16 },
        },
      }}
    >
      <AntApp>
        <TeacherMainContent />
      </AntApp>
    </ConfigProvider>
  );
}

type PickAnimationState = "idle" | "running" | "locked" | "showcase";

function TeacherMainContent(): ReactElement {
  const { notification, message } = AntApp.useApp();
  const classId = getActiveClassId() ?? "class-1";
  const realtime = useRealtimeClient();
  const realtimeStatus = useRealtimeStatus();

  // Data Queries
  const classroomQuery = useClassroom(classId);
  const studentsQuery = useStudents(classId, { page: 1, pageSize: 100 });
  const layoutQuery = useSeatLayout(classId);
  // Mutations
  const scoreEventMutation = useCreateScoreEvent(classId);
  const randomPickMutation = useRandomPick(classId);

  const students = useMemo(
    () => studentsQuery.data?.data ?? [],
    [studentsQuery.data],
  );
  const layout = layoutQuery.data;

  // Selected student state for manual or picked evaluation
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const teacherName = useSyncExternalStore(
    subscribeToTeacherSession,
    getTeacherNameSnapshot,
    getServerTeacherNameSnapshot,
  );

  // Random Pick Interactive States
  const [pickState, setPickState] = useState<PickAnimationState>("idle");
  const [highlightSeatId, setHighlightSeatId] = useState<string | null>(null);
  const [pickedStudent, setPickedStudent] = useState<Student | null>(null);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const marqueeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Normalize grid seats
  const gridSeats = useMemo(() => {
    if (layout?.seats && layout.seats.length > 0) {
      return layout.seats;
    }
    // Fallback: arrange all active students in a 4-column grid
    return students.map((s, idx) => ({
      id: `seat-${Math.floor(idx / 4)}-${idx % 4}`,
      row: Math.floor(idx / 4),
      col: idx % 4,
      cellType: "seat" as const,
      student: { id: s.id, name: s.name },
    }));
  }, [layout, students]);

  // Clean up marquee timer
  useEffect(() => {
    return () => {
      if (marqueeTimerRef.current) clearInterval(marqueeTimerRef.current);
    };
  }, []);

  // WebSocket & Broadcast Realtime Subscriptions
  useEffect(() => {
    const unsubscribers = [
      realtime.subscribe("SCORE_CHANGED", classId, () => {
        void studentsQuery.refetch();
      }),
      realtime.subscribe("SCORE_REVERTED", classId, () => {
        void studentsQuery.refetch();
      }),
      realtime.subscribe("SEAT_LAYOUT_CHANGED", classId, () => {
        void layoutQuery.refetch();
      }),
      realtime.subscribe("STUDENT_CHANGED", classId, () => {
        void studentsQuery.refetch();
        void layoutQuery.refetch();
      }),
      realtime.subscribe("RANDOM_PICKED", classId, (event) => {
        const picked = students.find((s) => s.id === event.payload.studentId);
        if (picked) {
          setPickedStudent(picked);
          const matchedSeat = gridSeats.find(
            (s) => s.student?.id === picked.id,
          );
          setHighlightSeatId(matchedSeat?.id ?? null);
        }
      }),
    ];

    const unsubscribeBroadcast = classroomRealtime.subscribe((event) => {
      if (event.classId !== classId) return;
      if (event.type === "SCORE_CHANGED" || event.type === "SCORE_REVERTED") {
        void studentsQuery.refetch();
      } else if (event.type === "SEAT_LAYOUT_CHANGED") {
        void layoutQuery.refetch();
      } else if (event.type === "STUDENT_CHANGED") {
        void studentsQuery.refetch();
        void layoutQuery.refetch();
      }
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      unsubscribeBroadcast();
    };
  }, [realtime, classId, students, gridSeats, studentsQuery, layoutQuery]);

  // Handle Random Pick flow
  const startRandomPick = async () => {
    if (pickState !== "idle" || students.length === 0) return;

    const availableStudents = students.filter(
      (s) => !excludedIds.includes(s.id),
    );
    const candidateList =
      availableStudents.length > 0 ? availableStudents : students;

    setPickState("running");
    setSelectedStudent(null);
    setDrawerOpen(false);

    // 1. Start rapid marquee hopping animation across seats
    const validSeatIds = gridSeats
      .filter((seat) => seat.student !== null)
      .map((seat) => seat.id);

    let hopCount = 0;
    const maxHops = 18;
    const intervalMs = 90;

    marqueeTimerRef.current = setInterval(() => {
      hopCount += 1;
      const randomSeatId =
        validSeatIds[Math.floor(Math.random() * validSeatIds.length)];
      setHighlightSeatId(randomSeatId ?? null);

      if (hopCount >= maxHops) {
        if (marqueeTimerRef.current) clearInterval(marqueeTimerRef.current);
      }
    }, intervalMs);

    try {
      // 2. Call backend random pick API
      const result = await randomPickMutation.mutateAsync(
        excludedIds.length >= students.length ? [] : excludedIds,
      );
      const chosenStudent =
        students.find((s) => s.id === result.student.id) ??
        candidateList[Math.floor(Math.random() * candidateList.length)] ??
        students[0];

      // Wait until marquee finishes
      await new Promise((r) => setTimeout(r, maxHops * intervalMs + 80));

      if (chosenStudent) {
        // Find matching seat in grid
        const matchedSeat = gridSeats.find(
          (s) => s.student?.id === chosenStudent.id,
        );
        setHighlightSeatId(matchedSeat?.id ?? gridSeats[0]?.id ?? null);
        setPickedStudent(chosenStudent);
        setExcludedIds((prev) =>
          prev.includes(chosenStudent.id) ? prev : [...prev, chosenStudent.id],
        );

        // Step 3: Lock highlight on seat
        setPickState("locked");

        // Broadcast to classroomRealtime
        classroomRealtime.publish({
          id: `event-${Date.now()}`,
          type: "RANDOM_PICKED",
          classId,
          occurredAt: new Date().toISOString(),
          payload: {
            studentId: chosenStudent.id,
            name: chosenStudent.name,
            displayDurationMs: 8000,
          },
        });

        // Step 4: After 400ms, pop up showcase modal with spring animation
        setTimeout(() => {
          setPickState("showcase");
        }, 400);
      }
    } catch {
      if (marqueeTimerRef.current) clearInterval(marqueeTimerRef.current);
      setPickState("idle");
      setHighlightSeatId(null);
      message.error("随机点名失败，请稍后重试");
    }
  };

  // Open drawer from showcase or manual seat click
  const openEvaluationDrawer = (student: Student) => {
    setSelectedStudent(student);
    setDrawerOpen(true);
    setPickState("idle");
    setHighlightSeatId(null);
  };

  const handleSeatClick = (seat: Seat) => {
    if (pickState === "running") return;
    if (!seat.student) return;

    const matched = students.find((s) => s.id === seat.student?.id);
    if (matched) {
      setHighlightSeatId(seat.id);
      openEvaluationDrawer(matched);
    }
  };

  const classroomName = classroomQuery.data?.name ?? "高一(10)班";
  const subjectName = classroomQuery.data?.subject ?? "数学";
  const seatColumnCount = layout?.cols ?? 4;
  const seatGridMinWidth = `${Math.max(
    0,
    seatColumnCount * 56 + (seatColumnCount - 1) * 8,
  )}px`;

  return (
    <main
      className="teacher-surface"
      style={{
        minHeight: "100vh",
        background: "#f3f6fb",
        paddingBottom: "calc(112px + env(safe-area-inset-bottom))",
      }}
    >
      <div
        className="teacher-surface__content"
        style={{
          maxWidth: 480,
          margin: "0 auto",
          padding: "16px 14px",
        }}
      >
        {/* Header (Teacher App Header) */}
        <header
          className="teacher-surface__header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
            padding: "12px 16px",
            borderRadius: 18,
            boxShadow: "0 4px 20px rgba(25, 48, 86, 0.04)",
            border: "1px solid #e9f0f8",
            marginBottom: 14,
          }}
        >
          <div
            className="teacher-surface__header-main"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <Image
              src="/logo.png"
              alt="课序"
              width={36}
              height={36}
              className="rounded-xl shadow-sm"
              priority
            />
            <div className="teacher-surface__header-copy">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Typography.Text
                  strong
                  className="teacher-surface__header-title"
                  style={{ fontSize: 15, color: "#14233c" }}
                >
                  {classroomName} · {subjectName}
                </Typography.Text>
                <Tag
                  color={realtimeStatus === "CONNECTED" ? "success" : "processing"}
                  style={{
                    borderRadius: 999,
                    fontSize: 11,
                    padding: "0 7px",
                    margin: 0,
                  }}
                >
                  {realtimeStatus === "CONNECTED" ? "授课中 · 在线" : "授课中"}
                </Tag>
              </div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {teacherName}
              </Typography.Text>
            </div>
          </div>

          <Link href="/teacher/history">
            <Button
              size="small"
              icon={<HistoryOutlined />}
              style={{ borderRadius: 999, fontSize: 12 }}
            >
              记录
            </Button>
          </Link>
        </header>

        {/* Top Action Cards */}
        <div
          className="teacher-surface__top-actions"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <Card
            hoverable
            onClick={startRandomPick}
            style={{
              borderRadius: 16,
              background: "linear-gradient(135deg, #0a59f7 0%, #1e6bfb 100%)",
              color: "#ffffff",
              border: "none",
              cursor: "pointer",
            }}
            styles={{ body: { padding: "14px 16px" } }}
          >
            <div
              className="teacher-surface__action-content"
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "rgba(255, 255, 255, 0.2)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 18,
                }}
              >
                <ThunderboltFilled />
              </div>
              <div className="teacher-surface__action-copy">
                <Typography.Text
                  strong
                  className="teacher-surface__action-title"
                  style={{ color: "#ffffff", fontSize: 14, display: "block" }}
                >
                  随堂点名
                </Typography.Text>
                <Typography.Text
                  style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: 11 }}
                >
                  已点 {excludedIds.length} / {students.length}
                </Typography.Text>
              </div>
            </div>
          </Card>

          <Card
            hoverable
            onClick={() => setSearchOpen(true)}
            style={{
              borderRadius: 16,
              background: "#ffffff",
              border: "1px solid #e6edf5",
              cursor: "pointer",
            }}
            styles={{ body: { padding: "14px 16px" } }}
          >
            <div
              className="teacher-surface__action-content"
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "#f0f5ff",
                  color: "#0a59f7",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 18,
                }}
              >
                <SearchOutlined />
              </div>
              <div className="teacher-surface__action-copy">
                <Typography.Text
                  strong
                  className="teacher-surface__action-title"
                  style={{ color: "#14233c", fontSize: 14, display: "block" }}
                >
                  查找学生
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  共 {students.length} 名学生
                </Typography.Text>
              </div>
            </div>
          </Card>
        </div>

        {/* Seat Area (Podium + Seat Grid) */}
        <section
          className="teacher-seat-area teacher-seat-map"
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: "16px 14px",
            border:
              pickState === "running"
                ? "2px solid #0a59f7"
                : "1px solid #e7edf5",
            boxShadow:
              pickState === "running"
                ? "0 0 24px rgba(10, 89, 247, 0.25)"
                : "0 8px 24px rgba(28, 52, 92, 0.04)",
            transition: "all 250ms ease",
            marginBottom: 16,
          }}
        >
          {/* Podium */}
          <div
            style={{
              background: "#f0f4fa",
              borderRadius: 10,
              padding: "7px 0",
              textAlign: "center",
              marginBottom: 16,
              border: "1px solid #e1e9f4",
            }}
          >
            <Typography.Text
              type="secondary"
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 2,
                color: "#6b7d96",
              }}
            >
              讲 台 · 黑 板 方 向
            </Typography.Text>
          </div>

          {/* Seat Grid */}
          {studentsQuery.isLoading ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Spin />
            </div>
          ) : gridSeats.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="班级暂无学生"
            />
          ) : (
            <div className="teacher-seat-grid-scroll">
              <div
                className="teacher-seat-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${seatColumnCount}, minmax(0, 1fr))`,
                  gap: 8,
                  "--teacher-seat-grid-min-width": seatGridMinWidth,
                } as CSSProperties}
              >
              {gridSeats.map((seat) => {
                const hasStudent = Boolean(seat.student);
                const isHighlighted = highlightSeatId === seat.id;
                const isSelected = selectedStudent?.id === seat.student?.id;

                if (seat.cellType === "aisle") {
                  return (
                    <div
                      key={seat.id}
                      style={{
                        minHeight: 56,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 2,
                          height: "60%",
                          background: "#edf2f7",
                          borderRadius: 999,
                        }}
                      />
                    </div>
                  );
                }

                if (!hasStudent) {
                  return (
                    <div
                      key={seat.id}
                      style={{
                        minHeight: 56,
                        borderRadius: 12,
                        border: "1px dashed #e2e8f0",
                        background: "#fafbfd",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Typography.Text
                        type="secondary"
                        style={{
                          fontSize: 11,
                          color: "#cbd5e1",
                          whiteSpace: "nowrap",
                        }}
                      >
                        空座
                      </Typography.Text>
                    </div>
                  );
                }

                return (
                  <motion.div
                    key={seat.id}
                    whileTap={{ scale: 0.95 }}
                    animate={{
                      scale: isHighlighted ? 1.08 : isSelected ? 1.04 : 1,
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    onClick={() => handleSeatClick(seat)}
                    style={{
                      minHeight: 58,
                      borderRadius: 12,
                      padding: "8px 6px",
                      cursor: "pointer",
                      border: isHighlighted
                        ? "2px solid #0a59f7"
                        : isSelected
                          ? "2px solid #0a59f7"
                          : "1px solid #e2e8f0",
                      background: isHighlighted
                        ? "#0a59f7"
                        : isSelected
                          ? "#edf4ff"
                          : "#ffffff",
                      boxShadow: isHighlighted
                        ? "0 6px 18px rgba(10, 89, 247, 0.35)"
                        : "0 2px 6px rgba(0, 0, 0, 0.02)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      textAlign: "center",
                      transition:
                        "background 150ms ease, border-color 150ms ease",
                    }}
                  >
                    <Typography.Text
                      strong
                      style={{
                        fontSize: 13,
                        color: isHighlighted
                          ? "#ffffff"
                          : isSelected
                            ? "#0a59f7"
                            : "#1e293b",
                        lineHeight: 1.2,
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {seat.student?.name}
                    </Typography.Text>
                    <Typography.Text
                      style={{
                        fontSize: 10,
                        color: isHighlighted
                          ? "rgba(255, 255, 255, 0.8)"
                          : "#94a3b8",
                        marginTop: 2,
                      }}
                    >
                      {seat.student?.id.slice(-3) ?? ""}
                    </Typography.Text>
                  </motion.div>
                );
              })}
              </div>
              {seatColumnCount > 4 ? (
                <p className="teacher-seat-grid-hint">左右滑动查看完整座位表</p>
              ) : null}
            </div>
          )}
        </section>

        <section
          className="teacher-mobile-students"
          aria-label="学生列表"
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 16,
            border: "1px solid #e7edf5",
            boxShadow: "0 8px 24px rgba(28, 52, 92, 0.04)",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <Typography.Text strong style={{ fontSize: 16, color: "#14233c" }}>
                选择学生
              </Typography.Text>
              <Typography.Text
                type="secondary"
                style={{ display: "block", fontSize: 12, marginTop: 2 }}
              >
                点选学生快速评价
              </Typography.Text>
            </div>
            <Tag color="blue" style={{ margin: 0, borderRadius: 999 }}>
              {students.length} 人
            </Tag>
          </div>

          {studentsQuery.isLoading ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <Spin />
            </div>
          ) : students.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="班级暂无学生"
            />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 8,
              }}
            >
              {students.map((student) => {
                const isSelected = selectedStudent?.id === student.id;
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => openEvaluationDrawer(student)}
                    style={{
                      minWidth: 0,
                      minHeight: 64,
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      padding: "10px 11px",
                      borderRadius: 14,
                      border: isSelected
                        ? "1px solid #0a59f7"
                        : "1px solid #e4ebf4",
                      background: isSelected ? "#edf4ff" : "#ffffff",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        width: 34,
                        height: 34,
                        flexShrink: 0,
                        display: "grid",
                        placeItems: "center",
                        borderRadius: 10,
                        background: isSelected ? "#0a59f7" : "#f0f4fa",
                        color: isSelected ? "#ffffff" : "#55709b",
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {student.name.slice(0, 1)}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "#213758",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {student.name}
                      </span>
                      <span style={{ color: "#8b9ab0", fontSize: 11 }}>
                        {student.studentNo}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Bottom CTA Bar */}
        <div
          className="teacher-surface__bottom-bar"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "10px 16px calc(12px + env(safe-area-inset-bottom))",
            background: "rgba(255, 255, 255, 0.92)",
            backdropFilter: "blur(12px)",
            borderTop: "1px solid #e7edf5",
            zIndex: 10,
          }}
        >
          <div
            style={{
              maxWidth: 480,
              margin: "0 auto",
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <Button
              type="primary"
              size="large"
              icon={<ThunderboltOutlined />}
              disabled={pickState === "running"}
              onClick={startRandomPick}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 999,
                fontSize: 15,
                fontWeight: 600,
                background: "linear-gradient(135deg, #0a59f7 0%, #1e6bfb 100%)",
                boxShadow: "0 6px 16px rgba(10, 89, 247, 0.25)",
              }}
            >
              {pickState === "running" ? "正在随机点名..." : "随机点名"}
            </Button>

            <Button
              size="large"
              icon={<SearchOutlined />}
              onClick={() => setSearchOpen(true)}
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
              }}
            />
          </div>
        </div>
      </div>

      {/* Step 4: Non-linear Pop-up Showcase Modal */}
      <AnimatePresence>
        {pickState === "showcase" && pickedStudent && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              background: "rgba(10, 25, 48, 0.45)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              style={{
                width: "100%",
                maxWidth: 360,
                background: "#ffffff",
                borderRadius: 24,
                padding: "32px 24px",
                textAlign: "center",
                boxShadow: "0 24px 60px rgba(0, 0, 0, 0.2)",
                border: "1px solid #e7edf5",
              }}
            >
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 22,
                  background:
                    "linear-gradient(135deg, #0a59f7 0%, #2f7bff 100%)",
                  color: "#ffffff",
                  fontSize: 32,
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 16px",
                  boxShadow: "0 10px 24px rgba(10, 89, 247, 0.28)",
                }}
              >
                <UserOutlined />
              </div>

              <Tag
                color="blue"
                style={{ borderRadius: 999, padding: "2px 10px", fontSize: 12 }}
              >
                随机点名命中
              </Tag>

              <Typography.Title
                level={2}
                style={{ margin: "10px 0 4px", color: "#14233c" }}
              >
                {pickedStudent.name}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                学号 · {pickedStudent.studentNo}
              </Typography.Text>

              <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
                <Button
                  size="large"
                  onClick={() => {
                    setPickState("idle");
                    setHighlightSeatId(null);
                  }}
                  style={{ flex: 1, height: 44, borderRadius: 999 }}
                >
                  关闭
                </Button>
                <Button
                  type="primary"
                  size="large"
                  icon={<EditOutlined />}
                  onClick={() => openEvaluationDrawer(pickedStudent)}
                  style={{
                    flex: 1.5,
                    height: 44,
                    borderRadius: 999,
                    fontWeight: 600,
                  }}
                >
                  进行评价
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Step 6: Bottom Action Drawer (AntD Action Drawer) */}
      <TeacherScoreActionDrawer
        open={drawerOpen}
        student={selectedStudent}
        students={students}
        onClose={() => setDrawerOpen(false)}
        onSubmitEvent={async (input) => {
          try {
            await scoreEventMutation.mutateAsync(input);
            notification.success({ title: "积分已记录" });
            setDrawerOpen(false);
          } catch {
            message.error("提交失败");
          }
        }}
      />

      {/* Student Quick Search Drawer */}
      <Drawer
        title="查找学生"
        placement="bottom"
        size="min(82vh, 640px)"
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        styles={{
          body: {
            padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
            overflowY: "auto",
          },
        }}
      >
        <Input
          prefix={<SearchOutlined />}
          placeholder="输入学生姓名或学号"
          allowClear
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="large"
          style={{ borderRadius: 12, marginBottom: 16 }}
          autoFocus
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {students
            .filter(
              (s) =>
                s.name.includes(searchQuery.trim()) ||
                Boolean(s.studentNo?.includes(searchQuery.trim())),
            )
            .map((student) => (
              <div
                key={student.id}
                onClick={() => {
                  setSearchOpen(false);
                  openEvaluationDrawer(student);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: "#f8fafc",
                  border: "1px solid #edf2f7",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar
                    style={{
                      background: "#e8f0fe",
                      color: "#0a59f7",
                      fontWeight: 600,
                    }}
                  >
                    {student.name.slice(0, 1)}
                  </Avatar>
                  <div>
                    <Typography.Text strong style={{ fontSize: 14 }}>
                      {student.name}
                    </Typography.Text>
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 12, display: "block" }}
                    >
                      学号 · {student.studentNo}
                    </Typography.Text>
                  </div>
                </div>
                <Button size="small" type="primary">
                  评价
                </Button>
              </div>
            ))}
        </div>
      </Drawer>
    </main>
  );
}

// -------------------------------------------------------------
// Bottom Evaluation Action Drawer (Step 6 AntD Action Drawer)
// -------------------------------------------------------------

interface TeacherScoreActionDrawerProps {
  open: boolean;
  student: Student | null;
  students: Student[];
  onClose: () => void;
  onSubmitEvent: (input: CreateScoreEventInput) => Promise<void>;
}

const SCORE_EVENT_OPTIONS: Array<{ value: CreateScoreEventInput["type"]; label: string }> = [
  { value: "LATE", label: "迟到" },
  { value: "SCHOOL_UNIFORM", label: "校服" },
  { value: "EVENING_SELF_STUDY_CALLOUT", label: "晚自习点名" },
  { value: "NOISIEST_CLASS_TOP3", label: "班级噪音前三" },
  { value: "HOMEWORK_MISSING", label: "作业未交" },
  { value: "HOMEWORK_PRAISE", label: "作业表扬" },
  { value: "EXAM_GRADE_TOP10", label: "年级考试前十" },
  { value: "SUBJECT_TOP3", label: "单科前三" },
  { value: "BREAKTHROUGH", label: "突破性成绩" },
  { value: "PROGRESS", label: "进步名次" },
  { value: "DUTY_HYGIENE", label: "卫生事件" },
  { value: "DORM_HYGIENE", label: "寝室卫生" },
  { value: "COMMITTEE_TASK_COMPLETED", label: "班委任务完成" },
  { value: "BLACKBOARD", label: "黑板报" },
  { value: "INDIVIDUAL_ACTIVITY", label: "个人活动" },
  { value: "GROUP_ACTIVITY", label: "团体活动" },
  { value: "SPORTS_FINAL_TOP8", label: "运动会决赛" },
  { value: "ACTIVITY_NEGATIVE", label: "活动违规" },
  { value: "MANUAL", label: "自定义事件" },
];

const MANUAL_SCORE_EVENT_TYPES = new Set<CreateScoreEventInput["type"]>([
  "HOMEWORK_MISSING",
  "HOMEWORK_PRAISE",
  "BREAKTHROUGH",
  "PROGRESS",
  "DUTY_HYGIENE",
  "DORM_HYGIENE",
  "MANUAL",
]);

function TeacherScoreActionDrawer({
  open,
  student,
  students,
  onClose,
  onSubmitEvent,
}: TeacherScoreActionDrawerProps): ReactElement {
  return (
    <Drawer
      placement="bottom"
      size="min(82vh, 640px)"
      open={open && student !== null}
      onClose={onClose}
      destroyOnHidden
      styles={{
        section: {
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          overflow: "hidden",
        },
        body: {
          padding: "14px 20px calc(24px + env(safe-area-inset-bottom))",
          overflowY: "auto",
        },
      }}
      closeIcon={null}
    >
      {student && (
        <TeacherScoreDrawerContent
          key={student.id}
          student={student}
          students={students}
          onClose={onClose}
          onSubmitEvent={onSubmitEvent}
        />
      )}
    </Drawer>
  );
}

interface TeacherScoreDrawerContentProps {
  student: Student;
  students: Student[];
  onClose: () => void;
  onSubmitEvent: (input: CreateScoreEventInput) => Promise<void>;
}

function TeacherScoreDrawerContent({
  student,
  students,
  onClose,
  onSubmitEvent,
}: TeacherScoreDrawerContentProps): ReactElement {
  const [studentIds, setStudentIds] = useState<string[]>([student.id]);
  const [eventType, setEventType] = useState<CreateScoreEventInput["type"]>("LATE");
  const [minutesLate, setMinutesLate] = useState<number | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [manualDelta, setManualDelta] = useState<number | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [specialContribution, setSpecialContribution] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const needsRank = ["NOISIEST_CLASS_TOP3", "EXAM_GRADE_TOP10", "SUBJECT_TOP3", "BLACKBOARD", "INDIVIDUAL_ACTIVITY", "SPORTS_FINAL_TOP8", "GROUP_ACTIVITY"].includes(eventType);
  const needsManualDelta = MANUAL_SCORE_EVENT_TYPES.has(eventType);
  const canSubmit = studentIds.length > 0 &&
    (eventType !== "LATE" || (Number.isInteger(minutesLate) && minutesLate! > 0)) &&
    (!needsRank || (Number.isInteger(rank) && rank! > 0)) &&
    (!needsManualDelta || (Number.isInteger(manualDelta) && manualDelta !== 0 && reason.trim().length > 0));

  const handleConfirm = async () => {
    if (studentIds.length === 0) return;
    setSubmitting(true);
    try {
      const input: CreateScoreEventInput = { type: eventType, studentIds };
      if (eventType === "LATE") input.minutesLate = minutesLate ?? undefined;
      if (["NOISIEST_CLASS_TOP3", "EXAM_GRADE_TOP10", "SUBJECT_TOP3", "BLACKBOARD", "INDIVIDUAL_ACTIVITY", "SPORTS_FINAL_TOP8", "GROUP_ACTIVITY"].includes(eventType)) input.rank = rank ?? undefined;
      if (MANUAL_SCORE_EVENT_TYPES.has(eventType)) input.manualDelta = manualDelta ?? undefined;
      if (eventType === "GROUP_ACTIVITY") {
        input.isOrganizer = isOrganizer;
        input.specialContribution = specialContribution;
      }
      if (reason.trim()) input.reason = reason.trim();
      await onSubmitEvent(input);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "#d9d9d9",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar
            size={44}
            style={{
              background: "#0a59f7",
              color: "#ffffff",
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            {student.name.slice(0, 1)}
          </Avatar>
          <div>
            <Typography.Title level={4} style={{ margin: 0, color: "#14233c" }}>
              {student.name}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              学号 · {student.studentNo}
            </Typography.Text>
          </div>
        </div>

        <Button
          type="text"
          shape="circle"
          icon={<CloseOutlined />}
          onClick={onClose}
        />
      </div>

      <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
        <Select
          mode="multiple"
          value={studentIds}
          onChange={setStudentIds}
          options={students.map((item) => ({ value: item.id, label: item.name }))}
          maxTagCount="responsive"
          placeholder="学生"
        />
        <Select
          value={eventType}
          onChange={setEventType}
          options={SCORE_EVENT_OPTIONS}
          placeholder="事件"
        />
        {eventType === "LATE" && <InputNumber value={minutesLate} onChange={setMinutesLate} min={1} precision={0} placeholder="迟到分钟" style={{ width: "100%" }} />}
        {needsRank && <InputNumber value={rank} onChange={setRank} min={1} max={eventType === "EXAM_GRADE_TOP10" ? 10 : eventType === "SPORTS_FINAL_TOP8" ? 8 : 3} precision={0} placeholder="名次" style={{ width: "100%" }} />}
        {MANUAL_SCORE_EVENT_TYPES.has(eventType) && <InputNumber value={manualDelta} onChange={setManualDelta} precision={0} placeholder="最终分值" style={{ width: "100%" }} />}
        {eventType === "GROUP_ACTIVITY" && <div style={{ display: "flex", gap: 16 }}><Checkbox checked={isOrganizer} onChange={(event) => setIsOrganizer(event.target.checked)}>组织者</Checkbox><Checkbox checked={specialContribution} onChange={(event) => setSpecialContribution(event.target.checked)}>特殊贡献</Checkbox></div>}
        <Input.TextArea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={200} placeholder="原因" />
      </div>
      <Button
        type="primary"
        size="large"
        block
        loading={submitting}
        disabled={!canSubmit}
        onClick={handleConfirm}
        style={{
          height: 46,
          borderRadius: 999,
          fontWeight: 600,
          background: "linear-gradient(135deg, #0a59f7 0%, #1e6bfb 100%)",
        }}
      >
        记录
      </Button>
    </div>
  );
}

// -------------------------------------------------------------
// Teacher History View (/teacher/history)
// -------------------------------------------------------------

export function TeacherHistorySurface(): ReactElement {
  const classId = getActiveClassId() ?? "class-1";
  const recordsQuery = useScoreRecords(classId, { page: 1, pageSize: 100 });
  const revertScoreMutation = useRevertScore(classId);
  const records = useMemo(
    () => recordsQuery.data?.data ?? [],
    [recordsQuery.data],
  );
  const teacherId = getUserSession()?.user.id;

  const [filter, setFilter] = useState<"all" | "mine" | "reverted">("all");
  const [detailRecord, setDetailRecord] = useState<ScoreRecord | null>(null);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filter === "mine") return r.operator.id === teacherId;
      if (filter === "reverted") return r.reverted || r.recordType === "REVERT";
      return true;
    });
  }, [records, filter, teacherId]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f6fb",
        padding: "16px 14px 40px",
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Link href="/teacher">
            <Button shape="circle" icon={<ArrowLeftOutlined />} />
          </Link>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              积分流水记录
            </Typography.Title>
          </div>
        </header>

        {/* Filter Pills */}
        <div style={{ marginBottom: 14 }}>
          <Radio.Group
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as "all" | "mine" | "reverted")
            }
            buttonStyle="solid"
            style={{ display: "flex", width: "100%" }}
          >
            <Radio.Button
              value="all"
              style={{ flex: 1, textAlign: "center", borderRadius: 10 }}
            >
              全部记录
            </Radio.Button>
            <Radio.Button
              value="mine"
              style={{ flex: 1, textAlign: "center", borderRadius: 10 }}
            >
              本人操作
            </Radio.Button>
            <Radio.Button
              value="reverted"
              style={{ flex: 1, textAlign: "center", borderRadius: 10 }}
            >
              已撤销
            </Radio.Button>
          </Radio.Group>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <Card style={{ borderRadius: 16, textAlign: "center", padding: "40px 0" }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无匹配流水"
            />
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((record) => {
              const isReverted =
                record.reverted || record.recordType === "REVERT";
              const isPositive = record.delta > 0;
              return (
                <Card
                  key={record.id}
                  hoverable
                  onClick={() => setDetailRecord(record)}
                  style={{
                    borderRadius: 16,
                    border: "1px solid #e8eef6",
                  }}
                  styles={{ body: { padding: "14px 16px" } }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Typography.Text
                          strong
                          style={{ fontSize: 14, color: "#1e293b" }}
                        >
                          {record.student.name}
                        </Typography.Text>
                        <Tag
                          color={isReverted ? "default" : "blue"}
                          style={{ borderRadius: 999, fontSize: 11 }}
                        >
                          {record.eventId ? "事件积分" : record.rule?.name ?? "自定义积分"}
                        </Tag>
                        {isReverted ? (
                          <Tag style={{ borderRadius: 999, fontSize: 11 }}>
                            已撤销
                          </Tag>
                        ) : null}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          marginTop: 4,
                        }}
                      >
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 12 }}
                        >
                          {formatTime(record.createdAt)} ·{" "}
                          {record.operator.name}
                        </Typography.Text>
                      </div>
                    </div>

                    <Typography.Text
                      strong
                      style={{
                        fontSize: 18,
                        color: isPositive ? "#52c41a" : "#faad14",
                      }}
                    >
                      {formatDelta(record.delta)}
                    </Typography.Text>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Record Detail Drawer */}
      <Drawer
        title="积分流水详情"
        placement="bottom"
        open={detailRecord !== null}
        onClose={() => setDetailRecord(null)}
        styles={{
          section: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
          body: { padding: 20 },
        }}
      >
        {detailRecord && (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="学生姓名">
                {detailRecord.student.name}
              </Descriptions.Item>
              <Descriptions.Item label="积分规则">
                {detailRecord.rule?.name ?? "自定义积分"}
              </Descriptions.Item>
              <Descriptions.Item label="分值变动">
                <Typography.Text
                  strong
                  style={{
                    color: detailRecord.delta > 0 ? "#52c41a" : "#faad14",
                  }}
                >
                  {formatDelta(detailRecord.delta)}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="操作教师">
                {detailRecord.operator.name}
              </Descriptions.Item>
              <Descriptions.Item label="时间">
                {detailRecord.createdAt}
              </Descriptions.Item>
              <Descriptions.Item label="原因">
                {detailRecord.reason || "无"}
              </Descriptions.Item>
            </Descriptions>

            {!detailRecord.reverted &&
            detailRecord.recordType === "NORMAL" &&
            detailRecord.operator.id === teacherId ? (
              <Popconfirm
                title="撤销这笔积分？"
                okText="确认撤销"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={async () => {
                  try {
                    await revertScoreMutation.mutateAsync(detailRecord.id);
                    setDetailRecord(null);
                  } catch {
                    // handled by query hook
                  }
                }}
              >
                <Button
                  danger
                  block
                  size="large"
                  icon={<UndoOutlined />}
                  style={{ marginTop: 18, borderRadius: 999 }}
                >
                  撤销本条记录
                </Button>
              </Popconfirm>
            ) : null}
          </div>
        )}
      </Drawer>
    </main>
  );
}
