"use client";

import { InboxOutlined, LoadingOutlined } from "@ant-design/icons";
import { Alert, Spin, Typography, Upload } from "antd";
import type { UploadProps } from "antd";
import type { ReactNode } from "react";

interface StudentImportUploadProps {
  onFileSelect: (file: File) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function StudentImportUpload({
  onFileSelect,
  loading,
  error,
}: StudentImportUploadProps): ReactNode {
  const uploadProps: UploadProps = {
    name: "file",
    multiple: false,
    showUploadList: false,
    accept: ".xlsx,.xls,.csv",
    beforeUpload: (file) => {
      void onFileSelect(file);
      return false; // Prevent automatic upload
    },
    disabled: loading,
  };

  return (
    <div style={{ padding: "12px 0" }}>
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

      <Spin spinning={loading} indicator={<LoadingOutlined style={{ fontSize: 28 }} spin />} description="正在解析名单…">
        <Upload.Dragger
          {...uploadProps}
          style={{
            padding: "36px 16px",
            background: "#fafcff",
            borderColor: "#d9e4f5",
            borderRadius: 14,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          <p className="ant-upload-drag-icon" style={{ marginBottom: 14 }}>
            <InboxOutlined style={{ color: "#0a59f7", fontSize: 44 }} />
          </p>
          <Typography.Title level={4} style={{ margin: "0 0 8px", color: "#1a2c4e", fontWeight: 600 }}>
            拖拽 Excel / CSV 到此处，或点击选择文件
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: "0 0 12px", fontSize: 13 }}>
            支持 .xlsx / .csv 格式，单次最多支持导入 500 名学生
          </Typography.Paragraph>
        </Upload.Dragger>
      </Spin>
    </div>
  );
}
