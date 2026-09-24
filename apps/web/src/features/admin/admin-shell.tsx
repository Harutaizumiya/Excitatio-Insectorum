"use client";

import {
  AppstoreOutlined,
  BellOutlined,
  CalendarOutlined,
  BookOutlined,
  DesktopOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  HomeOutlined,
  LayoutOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  ReadOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Refine } from "@refinedev/core";
import { App as AntApp, Avatar, Badge, Breadcrumb, Button, ConfigProvider, Layout, Space, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { adminResources, cloneSeats, navItems, type AdminRoute } from "./admin-data";
import { AdminNotificationDrawer } from "./admin-notification-drawer";
import { FeedbackSubmitDrawer } from "./feedback/feedback-submit-drawer";
import { useAdminClassroom, useAdminNotifications, useAdminSchedule, useAdminSeating } from "./admin-queries";
import { useClassroomService } from "@/components/providers/classroom-system-provider";
import { getUserSession, clearUserSession } from "@/lib/session";

const { Header, Sider, Content } = Layout;

const iconByRoute: Record<AdminRoute, ReactNode> = {
  overview: <AppstoreOutlined />,
  students: <TeamOutlined />,
  "students-committee": <TeamOutlined />,
  dormitories: <HomeOutlined />,
  seating: <LayoutOutlined />,
  schedule: <CalendarOutlined />,
  teachers: <ReadOutlined />,
  "score-rules": <BookOutlined />,
  "score-records": <FileTextOutlined />,
  "display-devices": <DesktopOutlined />,
};

const pageTitleByPath: Record<string, string> = {
  "/admin": "班级概览",
  "/admin/students": "学生管理",
  "/admin/students/committee": "班委设置",
  "/admin/dormitories": "住宿生管理",
  "/admin/seating": "座位管理",
  "/admin/schedule": "课程表",
  "/admin/teachers": "任课教师",
  "/admin/score-rules": "积分规则",
  "/admin/score-records": "积分流水",
  "/admin/display-devices": "大屏设备",
};

interface AdminShellProps {
  children: ReactNode;
}

function getRouteFromPath(pathname: string): AdminRoute {
  if (pathname === "/admin") return "overview";
  if (pathname.startsWith("/admin/students/")) return "students";
  const segment = pathname.split("/").filter(Boolean).at(-1);
  return navItems.some((item) => item.key === segment)
    ? (segment as AdminRoute)
    : "overview";
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

export function AdminShell({ children }: AdminShellProps) {
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
          Button: { borderRadius: 999, controlHeight: 38 },
          Card: { borderRadiusLG: 16 },
          Table: { headerBg: "#f7f9fc", rowHoverBg: "#f7faff" },
        },
      }}
    >
      <AntApp>
        <AdminShellContent>{children}</AdminShellContent>
      </AntApp>
    </ConfigProvider>
  );
}

function AdminShellContent({ children }: AdminShellProps) {
  const { modal, notification } = AntApp.useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const service = useClassroomService();
  const [collapsed, setCollapsed] = useCollapsedSider();
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [feedbackDrawerOpen, setFeedbackDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const currentRoute = getRouteFromPath(pathname);
  const title = pageTitleByPath[pathname] ?? "班级概览";
  const { data: classroom } = useAdminClassroom();
  const classroomName = classroom?.name ?? "当前班级";
  const teacherName = useSyncExternalStore(
    subscribeToAdminSession,
    getAdminTeacherNameSnapshot,
    getServerAdminTeacherNameSnapshot,
  );

  const { isDirty, savedLayout, updateDraft } = useAdminSeating();
  const { isDirty: isScheduleDirty, savedSchedule, updateDraft: updateScheduleDraft } = useAdminSchedule();
  const { unreadCount, markAllAsRead } = useAdminNotifications();

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await service.logout();
    } catch (error) {
      notification.error({
        title: "退出登录请求失败",
        description: error instanceof Error ? error.message : "服务端未确认登出，本地登录态已清除。",
      });
      clearUserSession();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const confirmLogout = () => {
    modal.confirm({
      title: "确认退出登录？",
      content: "退出后需要重新登录才能进入后台。",
      okText: "退出登录",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: handleLogout,
    });
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if ((currentRoute === "seating" && isDirty) || (currentRoute === "schedule" && isScheduleDirty)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [currentRoute, isDirty, isScheduleDirty]);

  const handleNavClick = (e: React.MouseEvent, href: string) => {
    if (currentRoute === "seating" && isDirty && href !== "/admin/seating") {
      e.preventDefault();
      modal.confirm({
        title: "座位布局未保存",
        icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
        content: "当前座位布局存在未保存的修改。如果直接离开，未保存的修改将不会发布到大屏。确定要离开当前页面吗？",
        okText: "放弃修改并离开",
        okButtonProps: { danger: true },
        cancelText: "留在原处",
        onOk: () => {
          updateDraft({ ...savedLayout, seats: cloneSeats(savedLayout.seats) });
          navigate(href);
        },
      });
      return;
    }
    if (currentRoute === "schedule" && isScheduleDirty && href !== "/admin/schedule") {
      e.preventDefault();
      modal.confirm({
        title: "课程表未保存",
        icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
        content: "未保存的修改将丢失，确定离开？",
        okText: "离开",
        okButtonProps: { danger: true },
        cancelText: "取消",
        onOk: () => {
          updateScheduleDraft({
            ...savedSchedule,
            templates: savedSchedule.templates.map((template) => ({ ...template, periods: template.periods.map((period) => ({ ...period })) })),
            entries: savedSchedule.entries.map((entry) => ({ ...entry })),
          });
          navigate(href);
        },
      });
    }
  };

  return (
    <Refine
      resources={adminResources}
      options={{
        syncWithLocation: false,
        warnWhenUnsavedChanges: true,
        disableTelemetry: true,
        title: {
          text: "课序",
          icon: (
            <img
              src="/logo.png"
              alt="Logo"
              width={22}
              height={22}
              style={{ borderRadius: 6, objectFit: "cover" }}
            />
          ),
        },
      }}
    >
      <Layout style={{ minHeight: "100vh", background: "#f3f6fb" }}>
          <Sider
            collapsible
            trigger={null}
            collapsed={collapsed}
            width={244}
            collapsedWidth={76}
            style={{
              overflow: "hidden",
              height: "100vh",
              position: "sticky",
              top: 0,
              left: 0,
              background: "#ffffff",
              borderRight: "1px solid #e7edf5",
              boxShadow: "4px 0 20px rgba(33, 61, 102, 0.03)",
              zIndex: 100,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
              <div
                style={{
                  height: 72,
                  padding: collapsed ? "0 16px" : "0 22px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderBottom: "1px solid #edf1f6",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    flexShrink: 0,
                    borderRadius: 11,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 12px rgba(10, 89, 247, 0.16)",
                  }}
                >
                  <img
                    src="/logo.png"
                    alt="课序 Logo"
                    width={38}
                    height={38}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
                {!collapsed && (
                  <div style={{ minWidth: 0 }}>
                    <Typography.Text strong style={{ display: "block", color: "#10213f", fontSize: 15 }}>
                      课序
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      班级管理后台
                    </Typography.Text>
                  </div>
                )}
              </div>

              <nav aria-label="班主任后台导航" style={{ padding: "18px 12px", flex: 1, overflowY: "auto" }}>
                {!collapsed && (
                  <Typography.Text
                    type="secondary"
                    style={{ display: "block", margin: "0 12px 10px", fontSize: 11, letterSpacing: 1 }}
                  >
                    CLASSROOM
                  </Typography.Text>
                )}
                <Space orientation="vertical" size={4} style={{ display: "flex" }}>
                  {navItems.map((item) => {
                    const active = currentRoute === item.key;
                    return (
                      <Link
                        key={item.key}
                        to={item.href}
                        onClick={(e) => handleNavClick(e, item.href)}
                        title={collapsed ? item.label : undefined}
                        style={{
                          minHeight: 44,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: collapsed ? "center" : "flex-start",
                          gap: 12,
                          padding: collapsed ? "0 10px" : "0 13px",
                          borderRadius: 11,
                          color: active ? "#0a59f7" : "#6d7c92",
                          background: active ? "#edf4ff" : "transparent",
                          textDecoration: "none",
                          fontWeight: active ? 650 : 500,
                          transition: "all 160ms ease",
                        }}
                      >
                        <span style={{ display: "grid", placeItems: "center", fontSize: 17 }}>
                          {iconByRoute[item.key]}
                        </span>
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    );
                  })}
                </Space>
              </nav>

              <div style={{ padding: "16px 12px", flexShrink: 0 }}>
                <div
                  style={{
                    padding: collapsed ? "12px 8px" : "13px 14px",
                    border: "1px solid #e6edf8",
                    borderRadius: 14,
                    background: "#f8fbff",
                    textAlign: collapsed ? "center" : "left",
                  }}
                >
                  <Tag color="blue" style={{ margin: 0, border: 0, fontSize: 11 }}>
                    {collapsed ? "7B" : "目前班級"}
                  </Tag>
                  {!collapsed && (
                    <>
                      <Typography.Text strong style={{ display: "block", marginTop: 8, color: "#1b2c48" }}>
                        {classroomName}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {teacherName} · 班主任
                      </Typography.Text>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Sider>

          <Layout style={{ minWidth: 0, background: "#f3f6fb" }}>
            <Header
              style={{
                position: "sticky",
                top: 0,
                zIndex: 90,
                height: 72,
                padding: "0 28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(255,255,255,0.92)",
                borderBottom: "1px solid #e7edf5",
                backdropFilter: "blur(12px)",
              }}
            >
              <Space size={16} align="center">
                <Button
                  type="text"
                  aria-label={collapsed ? "展开导航" : "收起导航"}
                  icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => setCollapsed(!collapsed)}
                  style={{ color: "#53647c", fontSize: 17 }}
                />
                <Breadcrumb
                  separator="/"
                  items={[
                    { title: <span style={{ color: "#6d7c92" }}>{classroomName}</span> },
                    { title: <span style={{ color: "#172b4d", fontWeight: 600 }}>{title}</span> },
                  ]}
                  style={{ fontSize: 13 }}
                />
              </Space>

              <Space size={18} align="center">
                <Button
                  type="text"
                  icon={<MessageOutlined />}
                  onClick={() => setFeedbackDrawerOpen(true)}
                  aria-label="提交反馈"
                >
                  反馈
                </Button>
                <Badge count={unreadCount} size="small" offset={[-2, 4]} overflowCount={99}>
                  <Button
                    type="text"
                    shape="circle"
                    icon={<BellOutlined />}
                    aria-label="通知"
                    onClick={() => {
                      setNotificationDrawerOpen(true);
                      void markAllAsRead();
                    }}
                  />
                </Badge>
                <Space size={9}>
                  <Avatar size={35} style={{ background: "#dce9ff", color: "#0a59f7" }} icon={<UserOutlined />} />
                  <div style={{ lineHeight: 1.2 }}>
                    <Typography.Text strong style={{ display: "block", color: "#243650" }}>
                      {teacherName}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      HEAD TEACHER
                    </Typography.Text>
                  </div>
                </Space>
                <Button
                  type="text"
                  icon={<LogoutOutlined />}
                  aria-label="登出"
                  loading={loggingOut}
                  onClick={confirmLogout}
                  style={{ color: "#8190a6" }}
                />
              </Space>
            </Header>

            <Content style={{ minWidth: 0, padding: 24 }}>
              <div style={{ maxWidth: 1520, margin: "0 auto", minWidth: 0 }}>{children}</div>
            </Content>
          </Layout>
        </Layout>
        <AdminNotificationDrawer
          open={notificationDrawerOpen}
          onClose={() => setNotificationDrawerOpen(false)}
        />
        <FeedbackSubmitDrawer
          open={feedbackDrawerOpen}
          onClose={() => setFeedbackDrawerOpen(false)}
          module={currentRoute}
          page={pathname}
        />
      </Refine>
    );
}

function useCollapsedSider(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false);
  return [collapsed, setCollapsed];
}
