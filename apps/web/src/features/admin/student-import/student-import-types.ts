export type ImportStep = "upload" | "preview" | "result";

export type GenderEnum = "MALE" | "FEMALE" | "UNKNOWN";

export type RowValidationStatus = "NORMAL" | "WARNING" | "ERROR";

export interface ParsedStudent {
  sourceRow: number;
  name: string;
  studentNo: string | null;
  gender: GenderEnum;
  status: RowValidationStatus;
  warnings?: string[];
  errors?: string[];
}

export interface ImportMapping {
  nameColumn: string | null;
  studentNoColumn: string | null;
  genderColumn: string | null;
}

export interface ParseResult {
  fileName: string;
  totalRows: number;
  columns: string[];
  mapping: ImportMapping;
  students: ParsedStudent[];
  rawRows: Record<string, string>[];
}

export interface SkippedStudent {
  name: string;
  studentNo: string | null;
  reason: string;
}

export interface ImportResultData {
  totalSubmitted: number;
  importedCount: number;
  skippedStudents: SkippedStudent[];
}

export interface ImportStudentPayload {
  name: string;
  studentNo: string | null;
  gender: GenderEnum;
}

export const GENDER_LABEL_MAP: Record<GenderEnum, string> = {
  MALE: "男",
  FEMALE: "女",
  UNKNOWN: "未知",
};
