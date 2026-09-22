"use client";

import {
  ArrowUpOutlined,
  BookOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DesktopOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  LinkOutlined,
  LoadingOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  SwapOutlined,
  TeamOutlined,
  ReadOutlined,
  UndoOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { SeatingPage } from "./seating/seating-page";
import { SchedulePage } from "./schedule/schedule-page";
import { StudentImportModal, type ImportStudentPayload } from "./student-import";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Result,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import { App as AntApp } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import {
  defaultRuleGroups,
  formatDateTime,
  formatScoreRecordSource,
  navItems,
  type ActivityItem,
  type AdminBindingSession,
  type AdminRoute,
  type DisplayDevice,
  type ScoreRecord,
  type ScoreRule,
  type Student,
  type StudentStatus,
  type Teacher,
  type TeacherStatus,
} from "./admin-data";
import {
  useAdminDisplayDevices,
  useAdminClassroom,
  useAdminCommittee,
  useAdminScoreRecords,
  useAdminScorePeriodSummary,
  useAdminScoreRules,
  useAdminSeating,
  useAdminStudents,
  useAdminTeachers,
} from "./admin-queries";
import type { CreateScoreEventInput } from "@/lib";
import type { CommitteeAssignment, CommitteeAssignmentInput, UpdateCommitteeInput } from "@/lib";
import { getUserSession } from "@/lib/session";

const cardStyle: CSSProperties = {
  border: "1px solid #e5ebf4",
  boxShadow: "0 8px 24px rgba(34, 68, 116, 0.045)",
  background: "#ffffff",
};

const primaryButtonStyle: CSSProperties = {
  boxShadow: "0 7px 16px rgba(10, 89, 247, 0.17)",
  fontWeight: 650,
};

interface AdminPageProps {
  route: AdminRoute;
}

export function AdminPage({ route }: AdminPageProps) {
  switch (route) {
    case "students":
      return <StudentsPage />;
    case "students-committee":
      return <StudentCommitteePage />;
    case "seating":
      return <SeatingPage />;
    case "schedule":
      return <SchedulePage />;
    case "teachers":
      return <TeachersPage />;
    case "score-rules":
      return <ScoreRulesPage />;
    case "score-records":
      return <ScoreRecordsPage />;
    case "display-devices":
      return <DisplayDevicesPage />;
    case "overview":
    default:
      return <OverviewPage />;
  }
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
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
        {eyebrow && (
          <Typography.Text style={{ color: "#0a59f7", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
            {eyebrow.toUpperCase()}
          </Typography.Text>
        )}
        <Typography.Title level={2} style={{ margin: "5px 0 5px", color: "#172b4d", fontSize: 27 }}>
          {title}
        </Typography.Title>
        {description ? <Typography.Text type="secondary" style={{ fontSize: 13 }}>{description}</Typography.Text> : null}
      </div>
      {action}
    </div>
  );
}

function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 16 }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0, color: "#203554" }}>
          {title}
        </Typography.Title>
        {description && (
          <Typography.Text type="secondary" style={{ display: "block", marginTop: 4, fontSize: 12 }}>
            {description}
          </Typography.Text>
        )}
      </div>
      {action}
    </div>
  );
}

function StatusTag({ status, deletedAt }: { status: StudentStatus | TeacherStatus; deletedAt?: string | null }) {
  if (deletedAt) {
    return <Tag color="default" style={{ borderRadius: 999, paddingInline: 9 }}>已删除</Tag>;
  }
  const content: Record<StudentStatus | TeacherStatus, { color: string; label: string }> = {
    ACTIVE: { color: "success", label: "启用中" },
    PENDING: { color: "processing", label: "待接受邀请" },
    DISABLED: { color: "default", label: "已停用" },
    INACTIVE: { color: "default", label: "已停用" },
  };
  const item = content[status] ?? { color: "default", label: "已停用" };
  return <Tag color={item.color} style={{ borderRadius: 999, paddingInline: 9 }}>{item.label}</Tag>;
}

function ChangeTag({ delta }: { delta: number }) {
  return (
    <Tag color={delta >= 0 ? "success" : "error"} style={{ minWidth: 56, textAlign: "center", borderRadius: 999 }}>
      {delta > 0 ? `+${delta}` : delta}
    </Tag>
  );
}

function subscribeToAdminSession(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("classroom-auth-changed", onStoreChange);
  return () => window.removeEventListener("classroom-auth-changed", onStoreChange);
}

function getAdminTeacherNameSnapshot(): string {
  return getUserSession()?.user.name ?? "班主任";
}

function getServerAdminTeacherNameSnapshot(): string {
  return "班主任";
}

function getGreetingByHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function subscribeToAdminClock(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const timer = window.setInterval(onStoreChange, 60_000);
  return () => window.clearInterval(timer);
}

function getAdminGreetingSnapshot(): string {
  return getGreetingByHour(new Date().getHours());
}

function getServerAdminGreetingSnapshot(): string {
  return "早上好";
}

function OverviewPage() {
  const { data: classroom } = useAdminClassroom();
  const { students } = useAdminStudents();
  const { records } = useAdminScoreRecords();
  const { teachers } = useAdminTeachers();
  const { devices } = useAdminDisplayDevices();
  const { versions, seats } = useAdminSeating();

  const activeStudents = students.filter((s) => s.status === "ACTIVE");
  const activeTeachers = teachers.filter((t) => t.status === "ACTIVE");
  const pendingTeachers = teachers.filter((t) => t.status === "PENDING");
  const onlineDevices = devices.filter((d) => d.status === "ONLINE");
  const totalScore = records.reduce((sum, r) => sum + (r.reverted ? 0 : r.delta), 0);
  const seatedCount = seats.filter((s) => s.studentId !== null).length;
  const latestVersion = versions[0]?.version ?? "—";
  const teacherName = useSyncExternalStore(
    subscribeToAdminSession,
    getAdminTeacherNameSnapshot,
    getServerAdminTeacherNameSnapshot,
  );
  const greeting = useSyncExternalStore(
    subscribeToAdminClock,
    getAdminGreetingSnapshot,
    getServerAdminGreetingSnapshot,
  );
  const classroomName = classroom?.name ?? "当前班级";
  const recentActivities: ActivityItem[] = records.slice(0, 4).map((record) => ({
    id: record.id,
    title: `${record.operatorName}新增积分`,
    description: `${record.studentName} · ${formatScoreRecordSource(record)} · ${record.delta > 0 ? "+" : ""}${record.delta}`,
    time: formatDateTime(record.occurredAt),
    tone: record.delta > 0 ? "blue" : "orange",
  }));

  const quickLinks = navItems.filter((item) => item.key !== "overview");
  return (
    <div>
      <PageHeader
        eyebrow="Classroom overview"
        title={`${greeting}，${teacherName}`}
        description={`${classroom?.grade ?? ""} · ${classroom?.schoolYear ?? ""} · ${classroomName}`}
        action={
          <Space>
            <Tag color="blue" style={{ borderRadius: 999, padding: "5px 12px" }}>
              <CheckOutlined /> 数据同步正常
            </Tag>
          </Space>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            href="/admin/students"
            title="在籍学生"
            value={activeStudents.length}
            suffix="人"
            detail=""
            tone="#0a59f7"
            icon={<TeamOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            href="/admin/score-records"
            title="本周积分记录"
            value={records.length}
            suffix="笔"
            detail={records.length ? `共 ${records.length} 笔` : "暂无记录"}
            tone="#12a46b"
            icon={<ArrowUpOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            href="/admin/teachers"
            title="任课教师"
            value={activeTeachers.length}
            suffix="位"
            detail={pendingTeachers.length ? `${pendingTeachers.length} 位待接受邀请` : ""}
            tone="#7a5af8"
            icon={<ReadIcon />}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            href="/admin/display-devices"
            title="大屏设备"
            value={`${onlineDevices.length} / ${devices.length}`}
            detail={onlineDevices.length ? `${onlineDevices[0].name}在线` : "暂无在线设备"}
            tone="#f08c2e"
            icon={<DesktopIcon />}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={16} style={{ display: "flex" }}>
          <Card
            style={{ ...cardStyle, width: "100%", height: "100%" }}
            styles={{
              body: {
                padding: 22,
                display: "flex",
                flexDirection: "column",
                height: "100%",
              },
            }}
          >
            <SectionTitle title="快速入口" description="常用班级管理操作" />
            <Row gutter={[12, 12]} style={{ flex: 1 }}>
              {quickLinks.map((item) => (
                <Col key={item.key} xs={24} sm={12} lg={8}>
                  <Link to={item.href} style={{ textDecoration: "none", display: "block", height: "100%" }}>
                    <div
                      className="transition-all duration-200 hover:border-[#0a59f7] hover:shadow-sm"
                      style={{
                        height: "100%",
                        minHeight: 98,
                        padding: 16,
                        border: "1px solid #e7edf5",
                        borderRadius: 13,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "#0a59f7", fontSize: 20 }}>{iconForRoute(item.key)}</span>
                      <span>
                        <Typography.Text strong style={{ display: "block", color: "#213957" }}>{item.label}</Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{item.description}</Typography.Text>
                      </span>
                    </div>
                  </Link>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
        <Col xs={24} xl={8} style={{ display: "flex" }}>
          <Card
            style={{ ...cardStyle, width: "100%", height: "100%" }}
            styles={{
              body: {
                padding: 22,
                display: "flex",
                flexDirection: "column",
                height: "100%",
              },
            }}
          >
            <SectionTitle title="今日课堂状态" description="截至 10:15" />
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-around",
                padding: "8px 0",
              }}
            >
              <StatusLine label="座位布局" value={`版本 ${latestVersion}`} color="#0a59f7" />
              <StatusLine label="本周班級總分" value={`${totalScore >= 0 ? "+" : ""}${totalScore}`} color="#12a46b" />
              <StatusLine label="已安排座位" value={`${seatedCount} / ${seats.length}`} color="#f08c2e" />
              <StatusLine label="大屏同步" value="正常" color="#12a46b" />
            </div>
          </Card>
        </Col>
      </Row>

      <Card style={{ ...cardStyle, marginTop: 16 }} styles={{ body: { padding: 22 } }}>
        <SectionTitle title="最近动态" description="班级内最近发生的管理活动" action={<Button type="link" href="/admin/score-records">查看全部流水</Button>} />
        <Space orientation="vertical" size={0} style={{ display: "flex" }}>
          {recentActivities.map((activity, index) => (
            <div
              key={activity.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                padding: "14px 0",
                borderTop: index === 0 ? "none" : "1px solid #eef2f7",
              }}
            >
              <div
                style={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, background: toneColor(activity.tone) }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Typography.Text strong style={{ display: "block", color: "#243957" }}>{activity.title}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{activity.description}</Typography.Text>
              </div>
              <Typography.Text type="secondary" style={{ flexShrink: 0, fontSize: 12 }}>{activity.time}</Typography.Text>
            </div>
          ))}
        </Space>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  suffix,
  detail,
  tone,
  icon,
  href,
}: {
  title: string;
  value: number | string;
  suffix?: string;
  detail?: string;
  tone: string;
  icon: ReactNode;
  href?: string;
}) {
  const cardElement = (
    <Card
      className="transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_14px_28px_rgba(34,68,116,0.09)] cursor-pointer"
      style={{ ...cardStyle, height: "100%" }}
      styles={{
        body: {
          padding: 19,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minHeight: 140,
        },
      }}
    >
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{title}</Typography.Text>
          <span style={{ width: 34, height: 34, borderRadius: 11, display: "grid", placeItems: "center", background: `${tone}12`, color: tone, fontSize: 17 }}>{icon}</span>
        </div>
        <Statistic value={value} suffix={suffix} styles={{ content: { marginTop: 8, color: "#172b4d", fontSize: 28, fontWeight: 700 } }} />
      </div>
      <div style={{ minHeight: 18, marginTop: 4 }}>
        {detail && detail.trim() ? (
          <Typography.Text style={{ color: tone, fontSize: 12, display: "block" }}>{detail}</Typography.Text>
        ) : null}
      </div>
    </Card>
  );

  if (href) {
    return (
      <Link to={href} style={{ textDecoration: "none", display: "block", height: "100%" }}>
        {cardElement}
      </Link>
    );
  }

  return cardElement;
}

function StatusLine({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Space size={8}><span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} /><Typography.Text type="secondary">{label}</Typography.Text></Space>
      <Typography.Text strong style={{ color: "#263c5b" }}>{value}</Typography.Text>
    </div>
  );
}

function StudentsPage() {
  const { notification } = AntApp.useApp();
  const { data: classroom } = useAdminClassroom();
  const {
    students,
    saveStudent: persistStudent,
    deactivateStudent,
    restoreStudent,
    deleteStudent: softDeleteStudent,
    batchImportStudents,
  } = useAdminStudents();
  const { createScoreEvent, isScoring } = useAdminScoreRecords();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<"ALL" | "DELETED" | StudentStatus>("ALL");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [scoringStudent, setScoringStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [form] = Form.useForm<StudentFormValues>();
  const [scoreForm] = Form.useForm<ScoreFormValues>();
  const classroomName = classroom?.name ?? "当前班级";

  const existingStudentNos = useMemo(
    () => new Set(students.map((s) => s.studentNo).filter(Boolean)),
    [students]
  );

  const filteredStudents = useMemo(
    () => students.filter((student) => {
      const matchesKeyword = !keyword || `${student.name}${student.studentNo}`.includes(keyword.trim());
      const matchesStatus = status === "ALL"
        ? true
        : status === "DELETED"
          ? Boolean(student.deletedAt)
          : !student.deletedAt && student.status === status;
      return matchesKeyword && matchesStatus;
    }),
    [keyword, status, students],
  );

  const openCreate = () => {
    setEditingStudent(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEdit = (student: Student) => {
    setEditingStudent(student);
    form.setFieldsValue({ name: student.name, studentNo: student.studentNo });
    setDrawerOpen(true);
  };

  const saveStudent = async (values: StudentFormValues) => {
    await persistStudent({ editingStudent, values });
    if (editingStudent) {
      notification.success({ title: "学生资料已更新", description: `${values.name} 的资料已经保存。` });
    } else {
      notification.success({ title: "学生已新增", description: `${values.name} 已加入 ${classroomName}。` });
    }
    setDrawerOpen(false);
  };

  const deactivate = async (student: Student) => {
    await deactivateStudent(student);
    notification.success({ title: "学生已停用", description: `${student.name} 已从当前座位和排行榜移除，历史资料仍保留。` });
  };

  const restore = async (student: Student) => {
    await restoreStudent(student);
    notification.success({ title: "学生已恢复", description: `${student.name} 已恢复为启用状态，请按需重新安排座位。` });
  };

  const softDelete = async (student: Student) => {
    await softDeleteStudent(student);
    notification.success({ title: "学生已删除", description: `${student.name} 已软删除，历史积分记录继续保留。` });
  };

  const handleBatchImport = async (importedStudents: ImportStudentPayload[]) => {
    await batchImportStudents(importedStudents);
    notification.success({
      title: "批量导入已完成",
      description: `已成功将学生导入至 ${classroomName}。`,
    });
  };

  const openScore = (student: Student) => {
    setScoringStudent(student);
    scoreForm.resetFields();
    scoreForm.setFieldsValue({ eventType: "LATE", studentIds: [student.id] });
  };

  const closeScore = () => {
    setScoringStudent(null);
    scoreForm.resetFields();
  };

  const saveScore = async (values: ScoreFormValues) => {
    if (!scoringStudent) return;
    const input: CreateScoreEventInput = {
      type: values.eventType,
      studentIds: values.studentIds,
      minutesLate: values.minutesLate,
      rank: values.rank,
      manualDelta: values.manualDelta,
      isOrganizer: values.isOrganizer,
      specialContribution: values.specialContribution,
      reason: values.reason?.trim() || undefined,
    };
    try {
      await createScoreEvent(input);
      notification.success({ title: "积分已记录" });
      closeScore();
    } catch (error) {
      notification.error({ title: error instanceof Error ? error.message : "提交失败" });
    }
  };

  const columns: ColumnsType<Student> = [
    { title: "学生", dataIndex: "name", width: 170, render: (name: string) => <Space><Avatar size={30} style={{ background: "#e9f1ff", color: "#0a59f7" }}>{name.slice(0, 1)}</Avatar><Typography.Text strong>{name}</Typography.Text></Space> },
    { title: "学号", dataIndex: "studentNo", width: 120, render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
    { title: "状态", dataIndex: "status", width: 120, render: (value: StudentStatus, student) => <StatusTag status={value} deletedAt={student.deletedAt} /> },
    { title: "当前座位", dataIndex: "seat", width: 130, render: (value: string | null) => value ? <Tag color="blue" style={{ borderRadius: 999 }}>{value}</Tag> : <Typography.Text type="secondary">未安排</Typography.Text> },
    { title: "最后更新", dataIndex: "updatedAt", width: 170, render: (value: string) => <Typography.Text type="secondary">{formatDateTime(value)}</Typography.Text> },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 390,
      render: (_, student) => (
        <Space size={4} wrap>
          <Button type="link" icon={<PlusOutlined />} onClick={() => openScore(student)} disabled={student.status !== "ACTIVE" || Boolean(student.deletedAt)}>
            积分
          </Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(student)} disabled={Boolean(student.deletedAt)}>
            编辑
          </Button>
          <Button type="link" icon={<EyeOutlined />} onClick={() => setHistoryStudent(student)}>
            历史
          </Button>
          {student.deletedAt ? (
            <Popconfirm
              title="恢复这名学生？"
              description="恢复后学生会重新进入启用名单，座位需要重新安排。"
              okText="确认恢复"
              cancelText="取消"
              onConfirm={() => restore(student)}
            >
              <Button type="link" icon={<ReloadOutlined />}>
                恢复
              </Button>
            </Popconfirm>
          ) : student.status === "ACTIVE" ? (
            <Popconfirm
              title="停用这名学生？"
              description="停用后会从当前座位和排行榜中移除，历史积分继续保留。"
              okText="确认停用"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => deactivate(student)}
            >
              <Button danger type="link" icon={<StopOutlined />}>
                停用
              </Button>
            </Popconfirm>
          ) : (
            <Popconfirm
              title="恢复这名学生？"
              description="恢复后学生会重新进入启用名单，座位需要重新安排。"
              okText="确认恢复"
              cancelText="取消"
              onConfirm={() => restore(student)}
            >
              <Button type="link" icon={<ReloadOutlined />}>
                恢复
              </Button>
            </Popconfirm>
          )}
          {!student.deletedAt && (
            <Popconfirm
              title="删除这名学生？"
              description="学生将被软删除并从当前管理列表隐藏，历史积分记录会继续保留。"
              okText="确认删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => softDelete(student)}
            >
              <Button danger type="link" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="学生管理"
        description={`管理 ${classroomName} 的学生资料、状态与座位安排。共 ${students.length} 名学生。`}
        action={
          <Space>
            <Link to="/admin/students/committee">
              <Button icon={<TeamOutlined />}>班委设置</Button>
            </Link>
            <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
              批量导入
            </Button>
            <Button type="primary" icon={<PlusOutlined />} style={primaryButtonStyle} onClick={openCreate}>
              新增学生
            </Button>
          </Space>
        }
      />
      <Card style={cardStyle} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: 18, borderBottom: "1px solid #eef2f7" }}>
          <Space wrap size={10}>
            <Input allowClear prefix={<SearchOutlined />} placeholder="搜索姓名或学号" value={keyword} onChange={(event) => setKeyword(event.target.value)} style={{ width: 245 }} />
            <Select value={status} onChange={setStatus} style={{ width: 150 }} options={[{ value: "ALL", label: "全部状态" }, { value: "ACTIVE", label: "启用中" }, { value: "INACTIVE", label: "已停用" }, { value: "DELETED", label: "已删除" }]} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>找到 {filteredStudents.length} 名学生</Typography.Text>
          </Space>
        </div>
      <Table rowKey="id" columns={columns} dataSource={filteredStudents} scroll={{ x: 1120 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 名` }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合条件的学生" /> }} />
      </Card>

      <Drawer title={editingStudent ? "编辑学生资料" : "新增学生"} open={drawerOpen} onClose={() => setDrawerOpen(false)} size={430} destroyOnHidden footer={<Space style={{ display: "flex", justifyContent: "flex-end" }}><Button onClick={() => setDrawerOpen(false)}>取消</Button><Button type="primary" onClick={() => void form.submit()}>{editingStudent ? "保存修改" : "新增学生"}</Button></Space>}>
        <Form form={form} layout="vertical" onFinish={saveStudent} requiredMark="optional">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入学生姓名" }, { max: 100, message: "姓名不能超过 100 个字符" }]}><Input placeholder="请输入学生姓名" /></Form.Item>
          <Form.Item name="studentNo" label="学号" rules={[{ required: true, message: "请输入学号" }, { max: 50, message: "学号不能超过 50 个字符" }]}><Input placeholder="例如：70213" /></Form.Item>
          {editingStudent && <Descriptions column={1} size="small" bordered style={{ marginTop: 24 }}><Descriptions.Item label="建立日期">{editingStudent.createdAt}</Descriptions.Item><Descriptions.Item label="当前状态"><StatusTag status={editingStudent.status} /></Descriptions.Item></Descriptions>}
        </Form>
      </Drawer>

      <Drawer title="学生历史详情" open={historyStudent !== null} onClose={() => setHistoryStudent(null)} size={430}>
        {historyStudent ? <><div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 22 }}><Avatar size={48} style={{ background: "#e9f1ff", color: "#0a59f7" }}>{historyStudent.name.slice(0, 1)}</Avatar><div><Typography.Title level={4} style={{ margin: 0 }}>{historyStudent.name}</Typography.Title><Typography.Text type="secondary">学号 {historyStudent.studentNo}</Typography.Text></div></div><Descriptions column={1} bordered size="small"><Descriptions.Item label="状态"><StatusTag status={historyStudent.status} deletedAt={historyStudent.deletedAt} /></Descriptions.Item><Descriptions.Item label="当前座位">{historyStudent.seat ?? "未安排"}</Descriptions.Item><Descriptions.Item label="加入班级">{historyStudent.createdAt}</Descriptions.Item><Descriptions.Item label="最后更新">{historyStudent.updatedAt}</Descriptions.Item></Descriptions><Divider /><Typography.Text strong>历史记录</Typography.Text><Space orientation="vertical" size={12} style={{ display: "flex", marginTop: 14 }}><HistoryEvent title="学生资料建立" time={`${historyStudent.createdAt} 09:00`} /><HistoryEvent title={historyStudent.deletedAt ? "学生已删除" : historyStudent.status === "INACTIVE" ? "学生已停用" : "资料最后更新"} time={historyStudent.updatedAt} /></Space></> : null}
      </Drawer>

      <Modal
        title={scoringStudent ? `为 ${scoringStudent.name} 记分` : "记分"}
        open={scoringStudent !== null}
        onCancel={closeScore}
        onOk={() => void scoreForm.submit()}
        okText="确认记分"
        cancelText="取消"
        confirmLoading={isScoring}
        destroyOnHidden
      >
          <Form
            form={scoreForm}
            layout="vertical"
          initialValues={{ eventType: "LATE", studentIds: scoringStudent ? [scoringStudent.id] : [] }}
            onFinish={saveScore}
            requiredMark="optional"
          >
          <Form.Item name="studentIds" label="学生" rules={[{ required: true, type: "array", min: 1, message: "请选择学生" }]}>
            <Select mode="multiple" options={students.filter((student) => student.status === "ACTIVE").map((student) => ({ value: student.id, label: student.name }))} />
          </Form.Item>
          <Form.Item name="eventType" label="事件" rules={[{ required: true, message: "请选择事件" }]}>
            <Select options={ADMIN_SCORE_EVENT_OPTIONS} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(previous, current) => previous.eventType !== current.eventType}>
            {({ getFieldValue }) => {
              const eventType = getFieldValue("eventType") as CreateScoreEventInput["type"];
              return <>
                {eventType === "LATE" && <Form.Item name="minutesLate" label="迟到分钟" rules={[{ required: true, type: "number", min: 1, message: "请输入迟到分钟" }]}><InputNumber precision={0} style={{ width: "100%" }} /></Form.Item>}
                {ADMIN_RANK_EVENTS.has(eventType) && <Form.Item name="rank" label="名次" rules={[{ required: true, type: "number", min: 1, message: "请输入名次" }]}><InputNumber precision={0} min={1} max={eventType === "EXAM_GRADE_TOP10" ? 10 : eventType === "SPORTS_FINAL_TOP8" ? 8 : 3} style={{ width: "100%" }} /></Form.Item>}
                {ADMIN_MANUAL_EVENTS.has(eventType) && <Form.Item name="manualDelta" label="最终分值" rules={[{ required: true, type: "number", min: -10000, max: 10000, validator: (_, value) => Number.isInteger(value) && value !== 0 ? Promise.resolve() : Promise.reject(new Error("请输入非 0 整数")) }]}><InputNumber precision={0} style={{ width: "100%" }} /></Form.Item>}
                {eventType === "GROUP_ACTIVITY" && <Space><Form.Item name="isOrganizer" valuePropName="checked" noStyle><Checkbox>组织者</Checkbox></Form.Item><Form.Item name="specialContribution" valuePropName="checked" noStyle><Checkbox>特殊贡献</Checkbox></Form.Item></Space>}
                <Form.Item name="reason" label="原因" rules={ADMIN_MANUAL_EVENTS.has(eventType) ? [{ required: true, message: "请输入原因" }] : undefined}><Input.TextArea rows={2} maxLength={200} /></Form.Item>
              </>;
            }}
          </Form.Item>
          </Form>
      </Modal>

      <StudentImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={handleBatchImport}
        existingStudentNos={existingStudentNos}
      />
    </div>
  );
}

interface StudentFormValues { name: string; studentNo: string }
interface ScoreFormValues {
  eventType: CreateScoreEventInput["type"];
  studentIds: string[];
  minutesLate?: number;
  rank?: number;
  manualDelta?: number;
  isOrganizer?: boolean;
  specialContribution?: boolean;
  reason?: string;
}

const ADMIN_SCORE_EVENT_OPTIONS: Array<{ value: CreateScoreEventInput["type"]; label: string }> = [
  { value: "LATE", label: "迟到" }, { value: "SCHOOL_UNIFORM", label: "校服" }, { value: "EVENING_SELF_STUDY_CALLOUT", label: "晚自习点名" }, { value: "NOISIEST_CLASS_TOP3", label: "班级噪音前三" }, { value: "HOMEWORK_MISSING", label: "作业未交" }, { value: "HOMEWORK_PRAISE", label: "作业表扬" }, { value: "EXAM_GRADE_TOP10", label: "年级考试前十" }, { value: "SUBJECT_TOP3", label: "单科前三" }, { value: "BREAKTHROUGH", label: "突破性成绩" }, { value: "PROGRESS", label: "进步名次" }, { value: "DUTY_HYGIENE", label: "卫生事件" }, { value: "DORM_HYGIENE", label: "寝室卫生" }, { value: "COMMITTEE_TASK_COMPLETED", label: "班委任务完成" }, { value: "BLACKBOARD", label: "黑板报" }, { value: "INDIVIDUAL_ACTIVITY", label: "个人活动" }, { value: "GROUP_ACTIVITY", label: "团体活动" }, { value: "SPORTS_FINAL_TOP8", label: "运动会决赛" }, { value: "ACTIVITY_NEGATIVE", label: "活动违规" }, { value: "MANUAL", label: "自定义事件" },
];
const ADMIN_RANK_EVENTS = new Set<CreateScoreEventInput["type"]>(["NOISIEST_CLASS_TOP3", "EXAM_GRADE_TOP10", "SUBJECT_TOP3", "BLACKBOARD", "INDIVIDUAL_ACTIVITY", "SPORTS_FINAL_TOP8", "GROUP_ACTIVITY"]);
const ADMIN_MANUAL_EVENTS = new Set<CreateScoreEventInput["type"]>(["HOMEWORK_MISSING", "HOMEWORK_PRAISE", "BREAKTHROUGH", "PROGRESS", "DUTY_HYGIENE", "DORM_HYGIENE", "MANUAL"]);

function HistoryEvent({ title, time }: { title: string; time: string }) {
  return <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><div style={{ width: 8, height: 8, marginTop: 5, borderRadius: "50%", background: "#8bb2ff" }} /><div><Typography.Text style={{ display: "block", color: "#314562" }}>{title}</Typography.Text><Typography.Text type="secondary" style={{ fontSize: 12 }}>{time}</Typography.Text></div></div>;
}

function TeachersPage() {
  const { notification } = AntApp.useApp();
  const { data: classroom } = useAdminClassroom();
  const {
    teachers,
    createTeacher: persistTeacher,
    generateInvitation: persistInvitation,
    setTeacherStatus: persistStatus,
    deleteTeacher: persistDelete,
  } = useAdminTeachers();
  const [createOpen, setCreateOpen] = useState(false);
  const [invite, setInvite] = useState<{ teacher: Teacher; url: string } | null>(null);
  const [detail, setDetail] = useState<Teacher | null>(null);
  const [form] = Form.useForm<TeacherFormValues>();
  const classroomName = classroom?.name ?? "当前班级";

  const generateInvitation = async (teacherId: string) => {
    const result = await persistInvitation(teacherId);
    if (detail?.id === teacherId) setDetail(result.updatedTeacher);
    setInvite({ teacher: result.updatedTeacher, url: result.url });
  };

  const createTeacher = async (values: TeacherFormValues) => {
    const result = await persistTeacher(values);
    setCreateOpen(false);
    form.resetFields();
    notification.success({ title: "教师已创建", description: "请生成一次性邀请链接发送给任课教师。" });
    setInvite({ teacher: result.invitedTeacher, url: result.url });
  };

  const handleToggleStatus = async (teacher: Teacher, nextStatus: TeacherStatus) => {
    await persistStatus({ teacherId: teacher.id, status: nextStatus });
    if (detail?.id === teacher.id) {
      setDetail({
        ...teacher,
        status: nextStatus,
        invitationUrl: nextStatus === "DISABLED" ? null : teacher.invitationUrl,
        invitationExpiresAt: nextStatus === "DISABLED" ? null : teacher.invitationExpiresAt,
      });
    }
    if (nextStatus === "DISABLED") {
      notification.success({ title: "教师已停用", description: `${teacher.name} 已无法访问 ${classroomName}。` });
    } else {
      notification.success({ title: "教师已启用", description: `${teacher.name} 已恢复班级访问权限。` });
    }
  };

  const handleDeleteTeacher = async (teacher: Teacher) => {
    await persistDelete(teacher.id);
    setDetail(null);
    notification.success({ title: "教师已删除", description: "已移除 " + teacher.name + " 的教师关系，历史积分记录继续保留。" });
  };

  const copyInvite = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      notification.success({ title: "邀请链接已复制" });
    } catch {
      notification.error({ title: "复制失败", description: "当前浏览器未授予剪贴板权限，请手动复制链接。" });
    }
  };

  const columns: ColumnsType<Teacher> = [
    {
      title: "教师",
      dataIndex: "name",
      width: 190,
      render: (name: string, teacher) => (
        <Space>
          <Avatar
            size={32}
            style={{
              background: teacher.status === "DISABLED" ? "#f0f2f5" : "#e9f1ff",
              color: teacher.status === "DISABLED" ? "#95a1b2" : "#0a59f7",
            }}
          >
            {name.slice(0, 1)}
          </Avatar>
          <Typography.Text strong>{name}</Typography.Text>
        </Space>
      ),
    },
    {
      title: "科目",
      dataIndex: "subject",
      width: 120,
      render: (value: string) => (
        <Tag color="blue" style={{ borderRadius: 999 }}>
          {value}
        </Tag>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 140,
      render: (value: TeacherStatus) => <StatusTag status={value} />,
    },
    {
      title: "最后活跃",
      dataIndex: "lastActiveAt",
      width: 175,
      render: (value: string | null) =>
        value ? formatDateTime(value) : <Typography.Text type="secondary">尚未接受邀请</Typography.Text>,
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 310,
      render: (_, teacher) => (
        <Space size={4}>
          <Button type="link" icon={<EyeOutlined />} onClick={() => setDetail(teacher)}>
            详情
          </Button>
          {teacher.status !== "DISABLED" && (
            <Button
              type="link"
              icon={<LinkOutlined />}
              onClick={() =>
                teacher.invitationUrl
                  ? setInvite({ teacher, url: teacher.invitationUrl })
                  : void generateInvitation(teacher.id)
              }
            >
              {teacher.invitationUrl ? "查看邀请" : "生成邀请"}
            </Button>
          )}
          {teacher.status === "PENDING" && (
            <Button type="link" icon={<ReloadOutlined />} onClick={() => void generateInvitation(teacher.id)}>
              重新邀请
            </Button>
          )}
          {teacher.status !== "DISABLED" ? (
            <Popconfirm
              title="停用该教师？"
              description="停用后该教师将无法访问班级与录入积分。"
              okText="确认停用"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleToggleStatus(teacher, "DISABLED")}
            >
              <Button danger type="link" icon={<StopOutlined />}>
                停用
              </Button>
            </Popconfirm>
          ) : (
            <Button
              type="link"
              icon={<CheckCircleOutlined />}
              onClick={() => void handleToggleStatus(teacher, "ACTIVE")}
            >
              启用
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="任课教师"
        description={`管理 ${classroomName} 的教师关系、邀请链接和班级访问权限。`}
        action={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={primaryButtonStyle}
            onClick={() => setCreateOpen(true)}
          >
            创建教师
          </Button>
        }
      />
      <Card style={cardStyle} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={teachers}
          scroll={{ x: 1060 }}
          pagination={false}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有任课教师" /> }}
        />
      </Card>
      <Modal
        title="创建任课教师"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void form.submit()}
        okText="创建并生成邀请"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={createTeacher} requiredMark="optional">
          <Form.Item name="name" label="教师姓名" rules={[{ required: true, message: "请输入教师姓名" }]}>
            <Input placeholder="例如：李佳蓉" />
          </Form.Item>
          <Form.Item name="subject" label="任教科目" rules={[{ required: true, message: "请输入任教科目" }]}>
            <Input placeholder="例如：英語" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="邀请链接已生成" open={invite !== null} onCancel={() => setInvite(null)} footer={null}>
        {invite && (
          <Space orientation="vertical" size={16} style={{ display: "flex" }}>
            <Alert
              showIcon
              type="success"
              title={`请将链接发送给 ${invite.teacher.name}`}
              description={`有效期至 ${invite.teacher.invitationExpiresAt ?? "2026-08-30 23:59"}`}
            />
            <Space.Compact style={{ width: "100%" }}>
              <Input value={invite.url} readOnly />
              <Button icon={<CopyOutlined />} onClick={() => void copyInvite(invite.url)}>
                复制
              </Button>
            </Space.Compact>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              教师打开链接后会在手机浏览器完成绑定，链接只可消费一次。
            </Typography.Text>
          </Space>
        )}
      </Modal>
      <Drawer title="教师详情" open={detail !== null} onClose={() => setDetail(null)} size={430}>
        {detail && (
          <>
            <div style={{ display: "flex", gap: 13, alignItems: "center", marginBottom: 22 }}>
              <Avatar
                size={48}
                style={{
                  background: detail.status === "DISABLED" ? "#f0f2f5" : "#e9f1ff",
                  color: detail.status === "DISABLED" ? "#95a1b2" : "#0a59f7",
                }}
              >
                {detail.name.slice(0, 1)}
              </Avatar>
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {detail.name}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {detail.subject} · 任课教师
                </Typography.Text>
              </div>
            </div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="教师 ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="关系状态">
                <StatusTag status={detail.status} />
              </Descriptions.Item>
              <Descriptions.Item label="班级">{classroomName}</Descriptions.Item>
              <Descriptions.Item label="邀请状态">
                {detail.invitationUrl
                  ? "待接受邀请"
                  : detail.status === "ACTIVE"
                  ? "已完成绑定"
                  : detail.status === "DISABLED"
                  ? "已停用"
                  : "无有效邀请"}
              </Descriptions.Item>
              <Descriptions.Item label="最后活跃">{detail.lastActiveAt ?? "尚未活跃"}</Descriptions.Item>
            </Descriptions>
            <Space wrap style={{ marginTop: 22 }}>
              {detail.status !== "DISABLED" && (
                <Button icon={<ReloadOutlined />} onClick={() => void generateInvitation(detail.id)}>
                  重新生成邀请
                </Button>
              )}
              {detail.status !== "DISABLED" ? (
                <Popconfirm
                  title="停用该教师？"
                  description="停用后该教师将无法访问班级与录入积分。"
                  okText="确认停用"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void handleToggleStatus(detail, "DISABLED")}
                >
                  <Button danger icon={<StopOutlined />}>
                    停用教师
                  </Button>
                </Popconfirm>
              ) : (
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => void handleToggleStatus(detail, "ACTIVE")}
                >
                  启用教师
                </Button>
              )}
              <Popconfirm
                title="确认删除该教师？"
                description="删除教师关系后，该教师将无法访问班级；历史积分记录会保留。"
                okText="确认删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => void handleDeleteTeacher(detail)}
              >
                <Button danger icon={<DeleteOutlined />}>
                  删除教师
                </Button>
              </Popconfirm>
            </Space>
          </>
        )}
      </Drawer>
    </div>
  );
}

interface TeacherFormValues { name: string; subject: string }

interface CommitteeFormValues {
  assignments: Array<CommitteeAssignmentInput & { key?: string }>;
}

const COMMITTEE_ROLE_OPTIONS = [
  "班长",
  "团支书",
  "劳动委员",
  "纪律委员",
  "学习委员",
  "课代表",
  "网管",
  "寝室长",
  "其他班委",
].map((role) => ({ value: role, label: role }));

interface ScoreRuleFormValues {
  name: string;
  group: string;
  delta?: number;
}

function ScoreRulesPage() {
  const { notification } = AntApp.useApp();
  const { rules, saveRule: persistRule, toggleRule: persistToggle, deleteRule: persistDelete } = useAdminScoreRules();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScoreRule | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ENABLED" | "DISABLED">("ALL");
  const [newGroupName, setNewGroupName] = useState("");
  const [form] = Form.useForm<ScoreRuleFormValues>();

  const allGroups = useMemo(() => {
    const set = new Set<string>(defaultRuleGroups);
    rules.forEach((r) => {
      if (r.group) set.add(r.group);
    });
    return [...set];
  }, [rules]);

  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      const matchKeyword =
        !searchKeyword ||
        rule.name.includes(searchKeyword.trim());
      const matchGroup = selectedGroup === "ALL" || rule.group === selectedGroup;
      const matchStatus =
        statusFilter === "ALL" || (statusFilter === "ENABLED" ? rule.enabled : !rule.enabled);
      return matchKeyword && matchGroup && matchStatus;
    });
  }, [rules, searchKeyword, selectedGroup, statusFilter]);

  const openRule = (rule?: ScoreRule) => {
    setEditing(rule ?? null);
    if (rule) {
      form.setFieldsValue({
        name: rule.name,
        group: rule.group || "课堂表现",
        delta: rule.delta,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        group: selectedGroup !== "ALL" ? selectedGroup : "课堂表现",
      });
    }
    setModalOpen(true);
  };

  const saveRule = async (values: ScoreRuleFormValues) => {
    await persistRule({ editing, values });
    if (editing) {
      notification.success({ title: "积分规则已更新" });
    } else {
      notification.success({ title: "积分规则已创建" });
    }
    setModalOpen(false);
  };

  const toggleRule = async (rule: ScoreRule) => {
    await persistToggle(rule);
    notification.success({ title: rule.enabled ? "规则已停用" : "规则已启用" });
  };

  const deleteRule = async (rule: ScoreRule) => {
    await persistDelete(rule);
    notification.success({ title: "积分规则已删除" });
  };

  const columns: ColumnsType<ScoreRule> = [
    {
      title: "规则名称",
      dataIndex: "name",
      width: 200,
      render: (value: string) => (
        <span>
          <Typography.Text strong style={{ display: "block" }}>
            {value}
          </Typography.Text>
        </span>
      ),
    },
    {
      title: "规则组",
      dataIndex: "group",
      width: 140,
      render: (value: string) => (
        <Tag color="geekblue" style={{ borderRadius: 999, paddingInline: 10, fontWeight: 500 }}>
          {value || "未分组"}
        </Tag>
      ),
    },
    {
      title: "分值变化",
      dataIndex: "delta",
      width: 120,
      render: (value: number) => <ChangeTag delta={value} />,
    },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 120,
      render: (value: boolean) => (
        <Tag color={value ? "success" : "default"} style={{ borderRadius: 999 }}>
          {value ? "启用中" : "已停用"}
        </Tag>
      ),
    },
    {
      title: "最后更新",
      dataIndex: "updatedAt",
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 220,
      render: (_, rule) => (
        <Space size={4}>
          <Button type="link" icon={<EditOutlined />} onClick={() => openRule(rule)}>
            编辑
          </Button>
          {rule.enabled ? (
            <Popconfirm
              title="停用这条规则？"
              okText="确认停用"
              cancelText="取消"
              onConfirm={() => toggleRule(rule)}
            >
              <Button type="link" danger icon={<StopOutlined />}>
                停用
              </Button>
            </Popconfirm>
          ) : (
            <Button type="link" icon={<CheckOutlined />} onClick={() => toggleRule(rule)}>
              启用
            </Button>
          )}
          <Popconfirm
            title="删除这条规则？"
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteRule(rule)}
          >
            <Button danger type="link" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="积分规则"
        action={
          <Button type="primary" icon={<PlusOutlined />} style={primaryButtonStyle} onClick={() => openRule()}>
            新增规则
          </Button>
        }
      />
      <Card style={cardStyle} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: 18, borderBottom: "1px solid #eef2f7" }}>
          <Space wrap size={10}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="按规则名称搜索"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ width: 210 }}
            />
            <Select
              value={selectedGroup}
              onChange={setSelectedGroup}
              style={{ width: 150 }}
              options={[
                { value: "ALL", label: "全部规则组" },
                ...allGroups.map((g) => ({ value: g, label: g })),
              ]}
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 130 }}
              options={[
                { value: "ALL", label: "全部状态" },
                { value: "ENABLED", label: "启用中" },
                { value: "DISABLED", label: "已停用" },
              ]}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              共 {filteredRules.length} 条规则
            </Typography.Text>
          </Space>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredRules}
          scroll={{ x: 960 }}
          pagination={false}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配积分规则" /> }}
        />
      </Card>
      <Modal
        title={editing ? "编辑积分规则" : "新增积分规则"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void form.submit()}
        okText="保存规则"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={saveRule} requiredMark="optional">
          <Form.Item
            name="group"
            label="所属规则组"
            rules={[{ required: true, message: "请选择或输入规则组" }]}
          >
            <Select
              placeholder="选择或输入规则组"
              options={allGroups.map((g) => ({ value: g, label: g }))}
              popupRender={(menu) => (
                <>
                  {menu}
                  <Divider style={{ margin: "8px 0" }} />
                  <div style={{ display: "flex", gap: 8, padding: "4px 8px" }}>
                    <Input
                      placeholder="新增自定义规则组"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                    <Button
                      type="text"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        const trimmed = newGroupName.trim();
                        if (trimmed) {
                          form.setFieldValue("group", trimmed);
                          setNewGroupName("");
                        }
                      }}
                    >
                      添加
                    </Button>
                  </div>
                </>
              )}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="规则名称"
            rules={[
              { required: true, message: "请输入规则名称" },
              { max: 100, message: "规则名称不能超过 100 个字符" },
            ]}
          >
            <Input placeholder="例如：主动回答问题" />
          </Form.Item>
          <Form.Item
            name="delta"
            label="积分变化"
            rules={[
              { required: true, message: "请输入积分变化" },
              {
                validator: (_, value: number | undefined) =>
                  value === undefined || !Number.isInteger(value) || value === 0
                    ? Promise.reject(new Error("积分必须是非零整数"))
                    : Promise.resolve(),
              },
            ]}
          >
            <InputNumber style={{ width: "100%" }} precision={0} placeholder="例如：2 或 -2" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function ScoreRecordsPage() {
  const { notification } = AntApp.useApp();
  const { records, refetch: refetchRecords, revertRecord: persistRevert } = useAdminScoreRecords();
  const { summary, refetch: refetchSummary } = useAdminScorePeriodSummary();
  const [studentKeyword, setStudentKeyword] = useState("");
  const [operatorId, setOperatorId] = useState("ALL");
  const [subject, setSubject] = useState("ALL");
  const [recordType, setRecordType] = useState<"ALL" | "NORMAL" | "REVERT">("ALL");
  const [detail, setDetail] = useState<ScoreRecord | null>(null);

  const filteredRecords = useMemo(() => records.filter((record) => {
    const studentMatch = !studentKeyword || record.studentName.includes(studentKeyword.trim());
    const operatorMatch = operatorId === "ALL" || record.operatorId === operatorId;
    const subjectMatch = subject === "ALL" || record.subject === subject;
    const typeMatch = recordType === "ALL" || record.recordType === recordType;
    return studentMatch && operatorMatch && subjectMatch && typeMatch;
  }), [operatorId, recordType, records, studentKeyword, subject]);

  const revertRecord = async (record: ScoreRecord) => {
    await persistRevert(record);
    notification.success({ title: "积分记录已撤销" });
    if (detail?.id === record.id) setDetail({ ...record, reverted: true });
  };

  const operators = [...new Map(records.map((record) => [record.operatorId, record.operatorName])).entries()];
  const subjects = [...new Set(records.map((record) => record.subject))];
  const columns: ColumnsType<ScoreRecord> = [
    { title: "时间", dataIndex: "createdAt", width: 175, render: (value: string) => <Typography.Text type="secondary">{formatDateTime(value)}</Typography.Text> },
    { title: "学生", dataIndex: "studentName", width: 150, render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
    { title: "教师 / 科目", key: "operator", width: 175, render: (_, record) => <span><Typography.Text style={{ display: "block" }}>{record.operatorName}</Typography.Text><Typography.Text type="secondary" style={{ fontSize: 12 }}>{record.subject}</Typography.Text></span> },
    { title: "类型", dataIndex: "recordType", width: 130, render: (value: "NORMAL" | "REVERT", record) => <Space size={5}><Tag color={value === "REVERT" ? "orange" : "blue"} style={{ borderRadius: 999 }}>{value === "REVERT" ? "撤销流水" : record.eventId ? "事件积分" : record.ruleName ? "规则积分" : "自定义积分"}</Tag>{record.reverted && value === "NORMAL" && <Tag color="default" style={{ borderRadius: 999 }}>已撤销</Tag>}</Space> },
    { title: "变化", dataIndex: "delta", width: 90, render: (value: number) => <ChangeTag delta={value} /> },
    { title: "操作", key: "actions", fixed: "right", width: 190, render: (_, record) => <Space size={3}><Button type="link" icon={<EyeOutlined />} onClick={() => setDetail(record)}>详情</Button>{record.recordType === "NORMAL" && <Popconfirm title="撤销这笔积分？" okText="确认撤销" cancelText="取消" okButtonProps={{ danger: true }} disabled={record.reverted} onConfirm={() => void revertRecord(record)}><Button danger type="link" icon={<UndoOutlined />} disabled={record.reverted}>{record.reverted ? "已撤销" : "撤销"}</Button></Popconfirm>}</Space> },
  ];

  const scoreColumns: ColumnsType<NonNullable<typeof summary>["students"][number]> = [
    { title: "名次", dataIndex: "rank", width: 80 },
    { title: "学生", dataIndex: "name" },
    { title: "积分", dataIndex: "score", width: 100 },
  ];

  return (
    <div>
      <PageHeader
        title="积分记录"
        action={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void refetchRecords();
              void refetchSummary();
            }}
          >
            刷新
          </Button>
        }
      />
      <Card style={cardStyle} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: 18, borderBottom: "1px solid #eef2f7" }}>
          <Space wrap size={10}>
            <Input allowClear prefix={<SearchOutlined />} placeholder="按学生搜索" value={studentKeyword} onChange={(event) => setStudentKeyword(event.target.value)} style={{ width: 190 }} />
            <Select value={operatorId} onChange={setOperatorId} style={{ width: 150 }} options={[{ value: "ALL", label: "全部教师" }, ...operators.map(([value, label]) => ({ value, label }))]} />
            <Select value={subject} onChange={setSubject} style={{ width: 130 }} options={[{ value: "ALL", label: "全部科目" }, ...subjects.map((value) => ({ value, label: value }))]} />
            <Select value={recordType} onChange={setRecordType} style={{ width: 130 }} options={[{ value: "ALL", label: "全部类型" }, { value: "NORMAL", label: "一般流水" }, { value: "REVERT", label: "撤销流水" }]} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>共 {filteredRecords.length} 笔</Typography.Text>
          </Space>
        </div>
        <Table rowKey="id" columns={columns} dataSource={filteredRecords} scroll={{ x: 980 }} pagination={{ pageSize: 8, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无积分流水" /> }} />
      </Card>
      <Card title="本月积分" style={{ ...cardStyle, marginTop: 16 }}>
        <Table
          rowKey="studentId"
          columns={scoreColumns}
          dataSource={summary?.students ?? []}
          loading={!summary}
          pagination={false}
          size="small"
          locale={{ emptyText: "暂无积分" }}
        />
      </Card>
      <Drawer title="积分记录详情" open={detail !== null} onClose={() => setDetail(null)} size={430}>
        {detail && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>{detail.studentName}</Typography.Title>
                <Typography.Text type="secondary">{detail.createdAt}</Typography.Text>
              </div>
              <ChangeTag delta={detail.delta} />
            </div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="记录类型">{detail.recordType === "REVERT" ? "撤销流水" : detail.eventId ? "事件积分" : detail.ruleName ? "规则积分" : "自定义积分"}</Descriptions.Item>
              <Descriptions.Item label="教师">{detail.operatorName}</Descriptions.Item>
              <Descriptions.Item label="科目">{detail.subject}</Descriptions.Item>
              <Descriptions.Item label="规则">{formatScoreRecordSource(detail)}</Descriptions.Item>
              <Descriptions.Item label="状态">{detail.reverted ? <Tag color="default">已撤销</Tag> : <Tag color="success">有效</Tag>}</Descriptions.Item>
              <Descriptions.Item label="原因">{detail.reason ?? "未填写"}</Descriptions.Item>
            </Descriptions>
            {detail.recordType === "NORMAL" && (
              <Popconfirm title="撤销这笔积分？" okText="确认撤销" cancelText="取消" okButtonProps={{ danger: true }} disabled={detail.reverted} onConfirm={() => void revertRecord(detail)}>
                <Button danger block style={{ marginTop: 22 }} icon={<UndoOutlined />} disabled={detail.reverted}>{detail.reverted ? "这笔记录已撤销" : "撤销此记录"}</Button>
              </Popconfirm>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}

function DisplayDevicesPage() {
  const { notification } = AntApp.useApp();
  const { data: classroom } = useAdminClassroom();
  const {
    devices,
    createBindingCode,
    pollBindingSession,
    revokeDevice: persistRevoke,
  } = useAdminDisplayDevices();
  const [bindOpen, setBindOpen] = useState(false);
  const [form] = Form.useForm<{ name: string }>();
  const [createdSession, setCreatedSession] =
    useState<AdminBindingSession | null>(null);
  const [sessionBound, setSessionBound] = useState(false);
  const [copied, setCopied] = useState(false);
  const classroomName = classroom?.name ?? "当前班级";

  const handleClose = () => {
    setBindOpen(false);
    setCreatedSession(null);
    setSessionBound(false);
    setCopied(false);
    form.resetFields();
  };

  const handleGenerateCode = async (values: { name: string }) => {
    if (devices.length >= 2) {
      notification.error({
        title: "已达到设备上限",
        description: "每个班级最多绑定两台有效大屏设备。",
      });
      return;
    }
    const session = await createBindingCode(values.name);
    setCreatedSession(session);
    setSessionBound(false);
  };

  useEffect(() => {
    if (!bindOpen || !createdSession || sessionBound) return;

    let stopped = false;
    const checkStatus = async () => {
      try {
        const latest = await pollBindingSession(createdSession.sessionId);
        if (stopped) return;
        if (latest.status === "READY") {
          setSessionBound(true);
          notification.success({
            title: "大屏设备绑定成功",
            description: `${createdSession.deviceName} 已成功连接到 ${classroomName}。`,
          });
        } else if (latest.status === "EXPIRED") {
          notification.error({
            title: "绑定码已过期",
            description: "请关闭窗口后重新生成绑定码。",
          });
        }
      } catch (error) {
        if (!stopped) {
          notification.error({
            title: "绑定状态查询失败",
            description: error instanceof Error ? error.message : "请稍后重试。",
          });
        }
      }
    };

    void checkStatus();
    const timer = window.setInterval(() => void checkStatus(), 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [bindOpen, classroomName, createdSession, sessionBound, pollBindingSession, notification]);

  const copyCode = () => {
    if (createdSession?.code) {
      void navigator.clipboard.writeText(createdSession.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const revokeDevice = async (device: DisplayDevice) => {
    await persistRevoke(device);
    notification.success({
      title: "设备已撤销",
      description: `${device.name} 的设备凭证已经失效。`,
    });
  };

  return (
    <div>
      <PageHeader
        title="大屏设备"
        description="管理课堂大屏绑定、在线状态与设备凭证。每个班级最多绑定 2 台有效设备。"
        action={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={primaryButtonStyle}
            disabled={devices.length >= 2}
            onClick={() => setBindOpen(true)}
          >
            绑定新设备
          </Button>
        }
      />
      <Row gutter={[16, 16]}>
        {devices.map((device) => (
          <Col key={device.id} xs={24} lg={12}>
            <Card style={cardStyle} styles={{ body: { padding: 22 } }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                  alignItems: "flex-start",
                }}
              >
                <Space size={13}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: 14,
                      background:
                        device.status === "ONLINE" ? "#eaf8f1" : "#f1f3f6",
                      color: device.status === "ONLINE" ? "#12a46b" : "#7f8da1",
                      fontSize: 23,
                    }}
                  >
                    <DesktopIcon />
                  </div>
                  <div>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {device.name}
                    </Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      设备 ID · {device.id}
                    </Typography.Text>
                  </div>
                </Space>
                <Badge
                  status={device.status === "ONLINE" ? "success" : "default"}
                  text={device.status === "ONLINE" ? "在线" : "离线"}
                />
              </div>
              <Divider style={{ margin: "20px 0" }} />
              <Descriptions column={1} size="small">
                <Descriptions.Item label="最后在线">
                  {device.lastSeenAt}
                </Descriptions.Item>
                <Descriptions.Item label="绑定时间">
                  {device.boundAt}
                </Descriptions.Item>
                <Descriptions.Item label="连接状态">
                  {device.status === "ONLINE" ? (
                    <Typography.Text style={{ color: "#12a46b" }}>
                      最近 90 秒内有心跳
                    </Typography.Text>
                  ) : (
                    <Typography.Text type="secondary">
                      超过 90 秒未收到心跳
                    </Typography.Text>
                  )}
                </Descriptions.Item>
              </Descriptions>
              <Popconfirm
                title="撤销这台设备？"
                description="撤销后设备凭证会立即失效，需要重新绑定。"
                okText="确认撤销"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => void revokeDevice(device)}
              >
                <Button
                  danger
                  type="link"
                  icon={<StopOutlined />}
                  style={{ paddingInline: 0, marginTop: 12 }}
                >
                  撤销设备
                </Button>
              </Popconfirm>
            </Card>
          </Col>
        ))}
        {devices.length === 0 && (
          <Col span={24}>
            <Card style={cardStyle}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="尚未绑定大屏设备"
              />
            </Card>
          </Col>
        )}
      </Row>
      <Card
        style={{ ...cardStyle, marginTop: 16 }}
        styles={{ body: { padding: 22 } }}
      >
        <SectionTitle
          title="绑定流程"
          description="在后台生成绑定码并在大屏端完成一次性绑定"
        />
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Step
              index="01"
              title="管理端生成绑定码"
              detail="输入设备名称后生成 10 分钟有效绑定码。"
            />
          </Col>
          <Col xs={24} md={8}>
            <Step
              index="02"
              title="大屏端输入绑定码"
              detail="大屏打开绑定页输入 6 位数字绑定码。"
            />
          </Col>
          <Col xs={24} md={8}>
            <Step
              index="03"
              title="设备自动完成注册"
              detail="大屏验证通过后自动注册并进入大屏。"
            />
          </Col>
        </Row>
      </Card>
      <Modal
        title={
          createdSession
            ? sessionBound
              ? "绑定成功"
              : "输入绑定码"
            : "绑定新大屏设备"
        }
        open={bindOpen}
        onCancel={handleClose}
        footer={null}
        destroyOnHidden
        width={460}
      >
        {!createdSession ? (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleGenerateCode}
            requiredMark="optional"
            style={{ marginTop: 16 }}
          >
            <Form.Item
              name="name"
              label="设备名称"
              rules={[
                { required: true, message: "请输入设备名称" },
                {
                  validator: (_, value: string | undefined) =>
                    value?.trim()
                      ? Promise.resolve()
                      : Promise.reject(new Error("设备名称不能只有空白字符")),
                },
              ]}
            >
              <Input placeholder="例如：教室前方大屏" autoFocus />
            </Form.Item>
            <Alert
              type="info"
              showIcon
              description="生成 10 分钟有效的 6 位绑定码，大屏端输入后即可完成绑定。"
              style={{ marginBottom: 20 }}
            />
            <Flex justify="flex-end" gap={10}>
              <Button onClick={handleClose}>取消</Button>
              <Button
                type="primary"
                htmlType="submit"
                style={primaryButtonStyle}
              >
                下一步，生成绑定码
              </Button>
            </Flex>
          </Form>
        ) : sessionBound ? (
          <Result
            status="success"
            title="绑定成功"
            subTitle={`${createdSession.deviceName} 已完成注册并接入班级`}
            extra={[
              <Button
                type="primary"
                key="close"
                onClick={handleClose}
                style={primaryButtonStyle}
              >
                完成
              </Button>,
            ]}
            style={{ padding: "20px 0 10px" }}
          />
        ) : (
          <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              设备名称：
              <Typography.Text strong>
                {createdSession.deviceName}
              </Typography.Text>
            </Typography.Text>

            <div
              style={{
                background: "#f8fbff",
                border: "1px solid #dce8fa",
                borderRadius: 14,
                padding: "20px 16px",
                margin: "16px 0",
              }}
            >
              <Typography.Text
                style={{
                  display: "block",
                  fontFamily: "monospace",
                  fontSize: 40,
                  fontWeight: 700,
                  letterSpacing: 6,
                  color: "#0a59f7",
                  lineHeight: 1.1,
                }}
              >
                {createdSession.code.slice(0, 3)} {createdSession.code.slice(3)}
              </Typography.Text>

              <Flex
                justify="center"
                align="center"
                gap={6}
                style={{ marginTop: 10 }}
              >
                <ClockCircleOutlined
                  style={{ color: "#faad14", fontSize: 13 }}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  有效期 10 分钟
                </Typography.Text>
              </Flex>
            </div>

            <Flex vertical align="center" gap={14}>
              <Button
                icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                onClick={copyCode}
                size="small"
              >
                {copied ? "已复制" : "复制绑定码"}
              </Button>

              <Tag
                icon={<LoadingOutlined />}
                color="processing"
                style={{
                  borderRadius: 999,
                  padding: "4px 14px",
                  fontSize: 12,
                  margin: 0,
                }}
              >
                等待大屏端输入绑定码...
              </Tag>
            </Flex>

            <Divider style={{ margin: "20px 0 14px" }} />

            <Flex justify="flex-end">
              <Button onClick={handleClose}>关闭</Button>
            </Flex>
          </div>
        )}
      </Modal>
    </div>
  );
}


function Step({ index, title, detail }: { index: string; title: string; detail: string }) {
  return <div style={{ display: "flex", gap: 12 }}><div style={{ width: 35, height: 35, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 10, color: "#0a59f7", background: "#edf4ff", fontSize: 12, fontWeight: 700 }}>{index}</div><div><Typography.Text strong style={{ display: "block", color: "#253b5b" }}>{title}</Typography.Text><Typography.Text type="secondary" style={{ display: "block", marginTop: 4, fontSize: 12, lineHeight: 1.55 }}>{detail}</Typography.Text></div></div>;
}

function iconForRoute(route: AdminRoute): ReactNode {
  switch (route) {
    case "students": return <TeamOutlined />;
    case "seating": return <SwapOutlined />;
    case "teachers": return <ReadIcon />;
    case "score-rules": return <BookIcon />;
    case "score-records": return <FileIcon />;
    case "display-devices": return <DesktopIcon />;
    case "overview": return <TeamOutlined />;
  }
}

function toneColor(tone: "blue" | "green" | "orange" | "gray"): string {
  return { blue: "#0a59f7", green: "#12a46b", orange: "#f08c2e", gray: "#a0adbd" }[tone];
}

function ReadIcon() { return <ReadOutlined />; }
function BookIcon() { return <BookOutlined />; }
function FileIcon() { return <FileTextOutlined />; }
function DesktopIcon() { return <DesktopOutlined />; }

function StudentCommitteePage() {
  const { notification } = AntApp.useApp();
  const { data: classroom } = useAdminClassroom();
  const { students } = useAdminStudents();
  const {
    assignments,
    updateCommittee,
    isLoading: committeeLoading,
    isSaving: committeeSaving,
  } = useAdminCommittee();
  const [committeeOpen, setCommitteeOpen] = useState(false);
  const [committeeForm] = Form.useForm<CommitteeFormValues>();
  const classroomName = classroom?.name ?? "当前班级";

  useEffect(() => {
    if (!committeeOpen) return;
    committeeForm.setFieldsValue({
      assignments: assignments.map((assignment) => ({
        key: assignment.id,
        studentId: assignment.studentId,
        role: assignment.role,
        subject: assignment.subject,
        termStartAt: assignment.termStartAt,
        termEndAt: assignment.termEndAt,
        trialEndsAt: assignment.trialEndsAt,
      })),
    });
  }, [assignments, committeeForm, committeeOpen]);

  const saveCommittee = async (values: CommitteeFormValues) => {
    const input: UpdateCommitteeInput = {
      assignments: values.assignments.map((assignment) => ({
        studentId: assignment.studentId,
        role: assignment.role,
        subject: assignment.subject?.trim() || null,
        termStartAt: assignment.termStartAt ?? new Date().toISOString(),
        termEndAt: assignment.termEndAt ?? null,
        trialEndsAt: assignment.trialEndsAt ?? null,
      })),
    };
    await updateCommittee(input);
    setCommitteeOpen(false);
    notification.success({ title: "班委已更新" });
  };

  const committeeColumns: ColumnsType<CommitteeAssignment> = [
    { title: "学生", dataIndex: "studentName" },
    { title: "班委角色", dataIndex: "role" },
    { title: "科目", dataIndex: "subject", render: (value: string | null) => value ?? "—" },
    { title: "试用截止", dataIndex: "trialEndsAt", render: (value: string | null) => value ? formatDateTime(value) : "—" },
    { title: "状态", dataIndex: "status", render: (value: CommitteeAssignment["status"]) => <Tag color={value === "ACTIVE" ? "success" : "default"}>{value === "ACTIVE" ? "有效" : "已撤销"}</Tag> },
  ];

  return (
    <div>
      <PageHeader
        title="班委设置"
        description={`配置 ${classroomName} 的班委角色、科目和试用期限。`}
        action={
          <Button type="primary" style={primaryButtonStyle} onClick={() => setCommitteeOpen(true)}>
            编辑班委
          </Button>
        }
      />
      <Card style={cardStyle} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          columns={committeeColumns}
          dataSource={assignments}
          loading={committeeLoading}
          pagination={false}
          scroll={{ x: 720 }}
          locale={{ emptyText: "暂无班委" }}
        />
      </Card>
      <Modal
        title="班委"
        open={committeeOpen}
        onCancel={() => setCommitteeOpen(false)}
        onOk={() => void committeeForm.submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={committeeSaving}
        destroyOnHidden
      >
        <Form
          form={committeeForm}
          layout="vertical"
          onFinish={saveCommittee}
          initialValues={{ assignments: [] }}
        >
          <Form.List name="assignments">
            {(fields, { add, remove }) => (
              <Space orientation="vertical" size={12} style={{ display: "flex" }}>
                {fields.map((field) => (
                  <Space key={field.key} align="start" style={{ display: "flex" }}>
                    <Form.Item name={[field.name, "studentId"]} rules={[{ required: true, message: "请选择学生" }]}>
                      <Select placeholder="学生" style={{ width: 140 }} options={students.filter((student) => student.status === "ACTIVE").map((student) => ({ value: student.id, label: student.name }))} />
                    </Form.Item>
                    <Form.Item name={[field.name, "role"]} rules={[{ required: true, message: "请选择角色" }]}>
                      <Select placeholder="角色" style={{ width: 130 }} options={COMMITTEE_ROLE_OPTIONS} />
                    </Form.Item>
                    <Form.Item name={[field.name, "subject"]}>
                      <Input placeholder="科目" style={{ width: 100 }} />
                    </Form.Item>
                    <Button type="link" danger onClick={() => remove(field.name)}>删除</Button>
                    <Form.Item name={[field.name, "termStartAt"]} hidden><Input /></Form.Item>
                    <Form.Item name={[field.name, "termEndAt"]} hidden><Input /></Form.Item>
                    <Form.Item name={[field.name, "trialEndsAt"]} hidden><Input /></Form.Item>
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add({ termStartAt: new Date().toISOString() })} block>
                  添加班委
                </Button>
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}
