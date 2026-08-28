"use client";

import { Alert, Col, Row, Select, Typography } from "antd";
import type { ReactNode } from "react";
import type { ImportMapping } from "./student-import-types";

interface StudentFieldMappingProps {
  columns: string[];
  mapping: ImportMapping;
  onMappingChange: (mapping: ImportMapping) => void;
}

export function StudentFieldMapping({
  columns,
  mapping,
  onMappingChange,
}: StudentFieldMappingProps): ReactNode {
  const columnOptions = columns.map((col) => ({
    value: col,
    label: col,
  }));

  const optionalOptions = [{ value: "__NONE__", label: "不导入" }, ...columnOptions];

  const handleNameChange = (val: string | null) => {
    onMappingChange({
      ...mapping,
      nameColumn: val || null,
    });
  };

  const handleStudentNoChange = (val: string) => {
    onMappingChange({
      ...mapping,
      studentNoColumn: val === "__NONE__" ? null : val,
    });
  };

  const handleGenderChange = (val: string) => {
    onMappingChange({
      ...mapping,
      genderColumn: val === "__NONE__" ? null : val,
    });
  };

  const noNameDetected = !mapping.nameColumn;

  return (
    <div
      style={{
        background: "#f9fbfe",
        border: "1px solid #e7edf5",
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 16,
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <Typography.Text strong style={{ fontSize: 13, color: "#192d4f" }}>
          字段映射关系
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
          请核对系统字段与表格列的对应关系
        </Typography.Text>
      </div>

      {noNameDetected && (
        <Alert
          type="warning"
          showIcon
          message="未识别到姓名列"
          description="请在下方选择名单中对应“姓名”的字段。"
          style={{ marginBottom: 12, borderRadius: 6 }}
        />
      )}

      <Row gutter={[16, 12]} align="middle">
        <Col xs={24} sm={8}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#4f6485", fontWeight: 500 }}>
              <span style={{ color: "#ff4d4f", marginRight: 3 }}>*</span>姓名（必填）
            </span>
            <Select
              placeholder="请选择姓名列"
              value={mapping.nameColumn ?? undefined}
              onChange={handleNameChange}
              options={columnOptions}
              status={noNameDetected ? "error" : undefined}
              style={{ width: "100%" }}
            />
          </div>
        </Col>

        <Col xs={24} sm={8}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#4f6485", fontWeight: 500 }}>
              学号（选填）
            </span>
            <Select
              placeholder="选择对应列或不导入"
              value={mapping.studentNoColumn ?? "__NONE__"}
              onChange={handleStudentNoChange}
              options={optionalOptions}
              style={{ width: "100%" }}
            />
          </div>
        </Col>

        <Col xs={24} sm={8}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#4f6485", fontWeight: 500 }}>
              性别（选填）
            </span>
            <Select
              placeholder="选择对应列或不导入"
              value={mapping.genderColumn ?? "__NONE__"}
              onChange={handleGenderChange}
              options={optionalOptions}
              style={{ width: "100%" }}
            />
          </div>
        </Col>
      </Row>
    </div>
  );
}
