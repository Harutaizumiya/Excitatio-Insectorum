"use client";

import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DesktopOutlined,
  LoadingOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import {
  App as AntApp,
  Button,
  Card,
  ConfigProvider,
  Flex,
  Input,
  Result,
  Typography,
} from "antd";
import { useNavigate } from "react-router-dom";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useClassroomService } from "@/components/providers/classroom-system-provider";

type BindingStatus = "INPUT" | "SUBMITTING" | "READY";

export function DisplayBindSurface(): ReactElement {
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
          Button: { borderRadius: 999, controlHeight: 44 },
          Card: { borderRadiusLG: 20 },
        },
      }}
    >
      <AntApp>
        <DisplayBindContent />
      </AntApp>
    </ConfigProvider>
  );
}

function DisplayBindContent(): ReactElement {
  const navigate = useNavigate();
  const service = useClassroomService();
  const { message } = AntApp.useApp();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<BindingStatus>("INPUT");
  const [classroomName, setClassroomName] = useState<string>("");
  const [redirectSeconds, setRedirectSeconds] = useState(3);

  const handleSubmit = async (inputCode: string) => {
    if (inputCode.length !== 6) return;
    setStatus("SUBMITTING");

    try {
      const result = await service.bindDisplayByCode(inputCode);
      setClassroomName(result.classroom.name);
      setStatus("READY");
      setRedirectSeconds(3);
    } catch (error) {
      setStatus("INPUT");
      setCode("");
      const errorText =
        error instanceof Error
          ? error.message
          : "绑定码无效、已过期或已被使用";
      message.error(errorText);
    }
  };

  const handleKeypadPress = (key: string) => {
    if (status !== "INPUT") return;

    if (key === "BACK") {
      setCode((prev) => prev.slice(0, -1));
    } else if (key === "CLEAR") {
      setCode("");
    } else if (/^\d$/.test(key)) {
      if (code.length < 6) {
        const next = code + key;
        setCode(next);
        if (next.length === 6) {
          void handleSubmit(next);
        }
      }
    }
  };

  const handleOtpChange = (value: string) => {
    setCode(value);
    if (value.length === 6) {
      void handleSubmit(value);
    }
  };

  useEffect(() => {
    if (status !== "READY") return;
    const timer = window.setInterval(() => {
      setRedirectSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === "READY" && redirectSeconds === 0) navigate("/display");
  }, [navigate, redirectSeconds, status]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f6fb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <Card
        style={{
          width: "100%",
          maxWidth: 440,
          boxShadow: "0 18px 48px rgba(15, 35, 75, 0.08)",
          borderRadius: 20,
          border: "1px solid #e7edf5",
        }}
        styles={{ body: { padding: 32 } }}
      >
        <Flex vertical align="center" gap={12} style={{ marginBottom: 24 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: "#edf3ff",
              color: "#0a59f7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
            }}
          >
            <DesktopOutlined />
          </div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            大屏设备绑定
          </Typography.Title>
          <Typography.Text type="secondary" style={{ textAlign: "center", fontSize: 13 }}>
            输入班级管理后台生成的 6 位数字绑定码即可完成设备配对
          </Typography.Text>
        </Flex>

        {status === "READY" ? (
          <Result
            icon={<CheckCircleOutlined style={{ color: "#12a46b" }} />}
            title="绑定成功"
            subTitle={`已连接到 ${classroomName || "班级大屏"}，设备凭证已就绪`}
            extra={
              <Button
                type="primary"
                icon={<ArrowRightOutlined />}
                onClick={() => navigate("/display")}
                style={{ minWidth: 160, fontWeight: 600 }}
              >
                进入大屏 ({redirectSeconds}s)
              </Button>
            }
            style={{ padding: "28px 0 8px" }}
          />
        ) : (
          <div style={{ marginTop: 24 }}>
            <div style={{ marginBottom: 24 }}>
              <Input.OTP
                value={code}
                onChange={handleOtpChange}
                length={6}
                size="large"
                disabled={status === "SUBMITTING"}
                style={{
                  justifyContent: "center",
                  gap: 10,
                }}
              />
            </div>

            {/* Numeric Keypad for Large Screen Touch Interaction */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
                maxWidth: 340,
                margin: "0 auto",
              }}
            >
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeypadPress(num)}
                  disabled={status === "SUBMITTING"}
                  style={{
                    height: 52,
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    fontSize: 22,
                    fontWeight: 600,
                    color: "#1e293b",
                    cursor: "pointer",
                    transition: "all 120ms ease",
                    display: "grid",
                    placeItems: "center",
                  }}
                  className="hover:bg-[#f1f5f9] active:scale-95"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleKeypadPress("CLEAR")}
                disabled={status === "SUBMITTING"}
                style={{
                  height: 52,
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#64748b",
                  cursor: "pointer",
                  transition: "all 120ms ease",
                  display: "grid",
                  placeItems: "center",
                }}
                className="hover:bg-[#f1f5f9] active:scale-95"
              >
                <DeleteOutlined style={{ fontSize: 16 }} />
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress("0")}
                disabled={status === "SUBMITTING"}
                style={{
                  height: 52,
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  fontSize: 22,
                  fontWeight: 600,
                  color: "#1e293b",
                  cursor: "pointer",
                  transition: "all 120ms ease",
                  display: "grid",
                  placeItems: "center",
                }}
                className="hover:bg-[#f1f5f9] active:scale-95"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress("BACK")}
                disabled={status === "SUBMITTING"}
                style={{
                  height: 52,
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#64748b",
                  cursor: "pointer",
                  transition: "all 120ms ease",
                  display: "grid",
                  placeItems: "center",
                }}
                className="hover:bg-[#f1f5f9] active:scale-95"
              >
                <RollbackOutlined style={{ fontSize: 16 }} />
              </button>
            </div>

            <Flex
              vertical
              align="center"
              gap={10}
              style={{ marginTop: 22, width: "100%" }}
            >
              {status === "SUBMITTING" ? (
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  <LoadingOutlined style={{ marginRight: 6 }} />
                  正在验证绑定码并注册设备...
                </Typography.Text>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  支持触摸屏点击、实体数字键盘或扫描输入
                </Typography.Text>
              )}

            </Flex>
          </div>
        )}
      </Card>
    </main>
  );
}
