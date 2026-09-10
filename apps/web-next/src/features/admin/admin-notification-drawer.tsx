"use client";

import {
  BellOutlined,
  DesktopOutlined,
  FileTextOutlined,
  LayoutOutlined,
  ReadOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Button, Drawer, Empty, Typography } from "antd";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import type { AdminNotification, NotificationType } from "./admin-data";
import { useAdminNotifications } from "./admin-queries";

interface AdminNotificationDrawerProps {
  open: boolean;
  onClose: () => void;
}

const typeIconMap: Record<NotificationType, ReactNode> = {
  score: <FileTextOutlined />,
  seating: <LayoutOutlined />,
  teacher: <ReadOutlined />,
  student: <TeamOutlined />,
  device: <DesktopOutlined />,
  system: <BellOutlined />,
};

export function AdminNotificationDrawer({
  open,
  onClose,
}: AdminNotificationDrawerProps) {
  const router = useRouter();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } =
    useAdminNotifications();

  useEffect(() => {
    if (open && unreadCount > 0) {
      void markAllAsRead();
    }
  }, [open, unreadCount, markAllAsRead]);

  const handleClick = (item: AdminNotification) => {
    void markAsRead(item.id);
    if (item.targetHref) {
      onClose();
      router.push(item.targetHref);
    }
  };

  return (
    <Drawer
      title="通知"
      open={open}
      onClose={onClose}
      size={380}
      extra={
        notifications.length > 0 ? (
          <Button
            type="text"
            size="small"
            onClick={() => void clearAll()}
            style={{ color: "#8c9ba5" }}
          >
            清空
          </Button>
        ) : null
      }
      styles={{
        body: { padding: "8px 12px" },
      }}
    >
      {notifications.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无通知"
          style={{ margin: "64px 0" }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {notifications.map((item, index) => (
            <div
              key={item.id}
              onClick={() => handleClick(item)}
              style={{
                padding: "14px 10px",
                cursor: item.targetHref ? "pointer" : "default",
                borderRadius: 8,
                transition: "background 150ms ease",
                borderBottom:
                  index === notifications.length - 1
                    ? "none"
                    : "1px solid #f0f3f7",
              }}
              className={item.targetHref ? "hover:bg-[#f4f7fb]" : undefined}
            >
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  width: "100%",
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                    background: "#f0f4fa",
                    color: "#506482",
                    fontSize: 15,
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {typeIconMap[item.type] ?? typeIconMap.system}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 8,
                    }}
                  >
                    <Typography.Text
                      strong
                      style={{ color: "#1c2e4a", fontSize: 13 }}
                    >
                      {item.title}
                    </Typography.Text>
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 11, flexShrink: 0 }}
                    >
                      {item.time}
                    </Typography.Text>
                  </div>
                  <Typography.Text
                    type="secondary"
                    style={{
                      display: "block",
                      marginTop: 3,
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    {item.description}
                  </Typography.Text>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
