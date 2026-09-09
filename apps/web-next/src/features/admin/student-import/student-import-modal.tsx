"use client";

import { App as AntApp, Button, Modal, Space, Steps } from "antd";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import {
  importStudentsApi,
  parseStudentImportApi,
  remapStudentImportApi,
} from "./student-import-api";
import { StudentFieldMapping } from "./student-field-mapping";
import { StudentImportPreview } from "./student-import-preview";
import { StudentImportResult } from "./student-import-result";
import { StudentImportUpload } from "./student-import-upload";
import type {
  ImportMapping,
  ImportResultData,
  ImportStep,
  ImportStudentPayload,
  ParseResult,
} from "./student-import-types";

interface StudentImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (students: ImportStudentPayload[]) => Promise<void>;
  existingStudentNos: Set<string>;
}

export function StudentImportModal({
  open,
  onClose,
  onSuccess,
  existingStudentNos,
}: StudentImportModalProps): ReactNode {
  const { message } = AntApp.useApp();
  const [currentStep, setCurrentStep] = useState<ImportStep>("upload");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseData, setParseData] = useState<ParseResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResultData | null>(null);

  const resetState = useCallback(() => {
    setCurrentStep("upload");
    setParsing(false);
    setImporting(false);
    setParseError(null);
    setParseData(null);
    setImportResult(null);
  }, []);

  const handleCancel = () => {
    if (importing) return;
    resetState();
    onClose();
  };

  const handleFileSelect = async (file: File) => {
    setParsing(true);
    setParseError(null);
    try {
      const data = await parseStudentImportApi(file);
      setParseData(data);
      setCurrentStep("preview");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "名单解析失败，请检查文件格式后重试";
      setParseError(errMsg);
      message.error(errMsg);
    } finally {
      setParsing(false);
    }
  };

  const handleMappingChange = async (newMapping: ImportMapping) => {
    if (!parseData) return;
    try {
      const remappedStudents = await remapStudentImportApi(parseData.rawRows, newMapping);
      setParseData({
        ...parseData,
        mapping: newMapping,
        students: remappedStudents,
      });
    } catch {
      message.error("字段重新映射失败，请重试");
    }
  };

  const handleConfirmImport = async () => {
    if (!parseData) return;
    const validStudents = parseData.students
      .filter((s) => s.status !== "ERROR" && s.name.trim().length > 0)
      .map<ImportStudentPayload>((s) => ({
        name: s.name,
        studentNo: s.studentNo,
        gender: s.gender,
      }));

    if (validStudents.length === 0) {
      message.warning("没有可导入的有效学生数据");
      return;
    }

    setImporting(true);
    try {
      const result = await importStudentsApi(validStudents, existingStudentNos);
      await onSuccess(validStudents);
      setImportResult(result);
      setCurrentStep("result");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "导入失败，请重试";
      message.error(errMsg);
    } finally {
      setImporting(false);
    }
  };

  const handleFinish = () => {
    resetState();
    onClose();
  };

  const stepIndex = currentStep === "upload" ? 0 : currentStep === "preview" ? 1 : 2;

  const validStudentsCount = parseData
    ? parseData.students.filter((s) => s.status !== "ERROR" && s.name.trim().length > 0).length
    : 0;

  return (
    <Modal
      title="批量导入学生"
      open={open}
      onCancel={handleCancel}
      width={780}
      destroyOnHidden
      footer={
        currentStep === "preview" ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Button onClick={() => setCurrentStep("upload")} disabled={importing}>
              重新上传
            </Button>
            <Space>
              <Button onClick={handleCancel} disabled={importing}>
                取消
              </Button>
              <Button
                type="primary"
                loading={importing}
                disabled={validStudentsCount === 0 || !parseData?.mapping.nameColumn}
                onClick={() => void handleConfirmImport()}
              >
                确认导入 {validStudentsCount > 0 ? `${validStudentsCount} 名学生` : ""}
              </Button>
            </Space>
          </div>
        ) : null
      }
      styles={{
        body: {
          paddingTop: 14,
        },
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <Steps
          current={stepIndex}
          size="small"
          items={[
            { title: "上传名单" },
            { title: "确认数据" },
            { title: "完成" },
          ]}
        />
      </div>

      {currentStep === "upload" && (
        <StudentImportUpload
          onFileSelect={handleFileSelect}
          loading={parsing}
          error={parseError}
        />
      )}

      {currentStep === "preview" && parseData && (
        <div>
          <StudentFieldMapping
            columns={parseData.columns}
            mapping={parseData.mapping}
            onMappingChange={(m) => void handleMappingChange(m)}
          />
          <StudentImportPreview
            students={parseData.students}
            totalRows={parseData.totalRows}
          />
        </div>
      )}

      {currentStep === "result" && importResult && (
        <StudentImportResult result={importResult} onComplete={handleFinish} />
      )}
    </Modal>
  );
}
