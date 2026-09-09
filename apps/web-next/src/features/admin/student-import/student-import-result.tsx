"use client";

import { CheckCircleFilled } from "@ant-design/icons";
import { Button, Collapse, Result, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ReactNode } from "react";
import type { ImportResultData, SkippedStudent } from "./student-import-types";

interface StudentImportResultProps {
  result: ImportResultData;
  onComplete: () => void;
}

export function StudentImportResult({
  result,
  onComplete,
}: StudentImportResultProps): ReactNode {
  const { importedCount, skippedStudents } = result;
  const skippedCount = skippedStudents.length;

  const skippedColumns: ColumnsType<SkippedStudent> = [
    {
      title: "姓名",
      dataIndex: "name",
      width: 140,
      render: (val: string) => <Typography.Text strong>{val}</Typography.Text>,
    },
    {
      title: "学号",
      dataIndex: "studentNo",
      width: 140,
      render: (val: string | null) => (val ? <Typography.Text code>{val}</Typography.Text> : "—"),
    },
    {
      title: "原因",
      dataIndex: "reason",
      render: (val: string) => <Typography.Text type="secondary">{val}</Typography.Text>,
    },
  ];

  return (
    <div style={{ padding: "16px 0" }}>
      <Result
        icon={<CheckCircleFilled style={{ color: "#12a46b", fontSize: 56 }} />}
        title="学生导入完成"
        subTitle={
          <span style={{ fontSize: 14, color: "#50627e" }}>
            成功导入 <strong style={{ color: "#12a46b" }}>{importedCount}</strong> 名学生
            {skippedCount > 0 && (
              <>
                ，已跳过 <strong style={{ color: "#fa8c16" }}>{skippedCount}</strong> 名已存在的重复学生
              </>
            )}
          </span>
        }
        extra={[
          <Button key="finish" type="primary" size="large" onClick={onComplete} style={{ minWidth: 120 }}>
            完成
          </Button>,
        ]}
      />

      {skippedCount > 0 && (
        <div style={{ maxWidth: 600, margin: "0 auto", marginTop: 12 }}>
          <Collapse
            ghost
            items={[
              {
                key: "skipped",
                label: (
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    查看已跳过的 {skippedCount} 名重复学生
                  </Typography.Text>
                ),
                children: (
                  <Table<SkippedStudent>
                    rowKey={(rec, idx) => `${rec.name}-${rec.studentNo}-${idx}`}
                    columns={skippedColumns}
                    dataSource={skippedStudents}
                    size="small"
                    pagination={false}
                    scroll={{ y: 180 }}
                    style={{ border: "1px solid #eef2f7", borderRadius: 8 }}
                  />
                ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
