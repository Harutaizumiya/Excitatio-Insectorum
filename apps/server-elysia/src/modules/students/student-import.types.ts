import type { StudentGender } from '@prisma/client';

export type { StudentGender };

export interface ImportedStudent {
  name: string;
  studentNo: string | null;
  gender: StudentGender;
}

export interface ImportColumnMapping {
  name: string | null;
  studentNo: string | null;
  gender: string | null;
}

export interface ImportWarning {
  sourceRow?: number;
  code: string;
  message: string;
}

export interface StudentImportParseResult {
  fileName: string;
  sheetName: string;
  headerRow: number;
  totalRows: number;
  validRows: number;
  mapping: ImportColumnMapping;
  columns: string[];
  students: Array<ImportedStudent & { sourceRow: number }>;
  warnings: ImportWarning[];
}

export interface ImportMappingInput {
  name?: string | null;
  studentNo?: string | null;
  gender?: string | null;
  nameColumn?: string | null;
  studentNoColumn?: string | null;
  genderColumn?: string | null;
}

export interface ImportDuplicate {
  name: string;
  studentNo: string | null;
  reason: 'STUDENT_ALREADY_EXISTS' | 'DUPLICATE_IN_IMPORT';
}

export interface ImportInvalidStudent {
  name: string;
  studentNo: string | null;
  reason: string;
}

export interface StudentImportResult {
  created: number;
  skipped: number;
  duplicates: ImportDuplicate[];
  errors: ImportInvalidStudent[];
}
