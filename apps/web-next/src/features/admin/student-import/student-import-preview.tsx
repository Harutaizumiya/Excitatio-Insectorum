"use client";

import { Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { GENDER_LABEL_MAP, type ParsedStudent } from "./student-import-types";

interface StudentImportPreviewProps {
  students: ParsedStudent[];
  totalRows: number;
}

export function StudentImportPreview({
  students,
  totalRows,
}: StudentImportPreviewProps): ReactNode {
  const { validCount, errorCount, warningCount } = useMemo(() => {
    let valid = 0;
    let err = 0;
    let warn = 0;
    students.forEach((s) => {
      if (s.status === "ERROR") {
        err++;
      } else {
        valid++;
        if (s.status === "WARNING") {
          warn++;
        }
      }
    });
    return { validCount: valid, errorCount: err, warningCount: warn };
  }, [students]);

  const columns: ColumnsType<ParsedStudent> = [
    {
      title: "行号",
      dataIndex: "sourceRow",
      width: 70,
      align: "center",
      render: (val: number) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {val}
        </Typography.Text>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (status: ParsedStudent["status"]) => {
        if (status === "ERROR") {
          return <Tag color="error" style={{ borderRadius: 999 }}>错误</Tag>;
        }
        if (status === "WARNING") {
          return <Tag color="warning" style={{ borderRadius: 999 }}>警告</Tag>;
        }
        return <Tag color="success" style={{ borderRadius: 999 }}>正常</Tag>;
      },
    },
    {
      title: "姓名",
      dataIndex: "name",
      width: 130,
      render: (name: string) =>
        name ? (
          <Typography.Text strong style={{ color: "#162848" }}>
            {name}
          </Typography.Text>
        ) : (
          <Typography.Text type="danger" style={{ fontSize: 12 }}>
            (未识别姓名)
          </Typography.Text>
        ),
    },
    {
      title: "学号",
      dataIndex: "studentNo",
      width: 130,
      render: (no: string | null) =>
        no ? (
          <Typography.Text code style={{ fontSize: 12 }}>
            {no}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: "性别",
      dataIndex: "gender",
      width: 90,
      render: (gender: ParsedStudent["gender"]) => (
        <span style={{ fontSize: 13, color: gender === "UNKNOWN" ? "#8c9ba5" : "#2f4366" }}>
          {GENDER_LABEL_MAP[gender]}
        </span>
      ),
    },
    {
      title: "问题与提示",
      key: "issues",
      render: (_, record) => {
        const issues = [...(record.errors ?? []), ...(record.warnings ?? [])];
        if (issues.length === 0) {
          return <Typography.Text type="secondary" style={{ fontSize: 12 }}>无异常</Typography.Text>;
        }
        return (
          <Space size={4} wrap>
            {record.errors?.map((err, i) => (
              <Tag key={`err-${i}`} color="error" style={{ fontSize: 11, borderRadius: 4 }}>
                {err}
              </Tag>
            ))}
            {record.warnings?.map((warn, i) => (
              <Tag key={`warn-${i}`} color="warning" style={{ fontSize: 11, borderRadius: 4 }}>
                {warn}
              </Tag>
            ))}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <Space size={8}>
          <Tag style={{ borderRadius: 6, margin: 0, padding: "2px 8px" }}>
            共识别 {totalRows} 行数据
          </Tag>
          <Tag color="success" style={{ borderRadius: 6, margin: 0, padding: "2px 8px" }}>
            {validCount} 名可导入
          </Tag>
          {errorCount > 0 && (
            <Tag color="error" style={{ borderRadius: 6, margin: 0, padding: "2px 8px" }}>
              {errorCount} 条错误（将跳过）
            </Tag>
          )}
          {warningCount > 0 && (
            <Tag color="warning" style={{ borderRadius: 6, margin: 0, padding: "2px 8px" }}>
              {warningCount} 条存在提示
            </Tag>
          )}
        </Space>
      </div>

      <Table<ParsedStudent>
        rowKey="sourceRow"
        columns={columns}
        dataSource={students}
        size="small"
        pagination={false}
        scroll={{ y: 260, x: 620 }}
        style={{
          border: "1px solid #eef2f7",
          borderRadius: 8,
          overflow: "hidden",
        }}
      />
    </div>
  );
}
