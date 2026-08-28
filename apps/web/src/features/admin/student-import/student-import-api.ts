import * as XLSX from "xlsx";
import type {
  GenderEnum,
  ImportMapping,
  ImportResultData,
  ImportStudentPayload,
  ParsedStudent,
  ParseResult,
  SkippedStudent,
} from "./student-import-types";

function normalizeGender(rawVal: string | undefined | null): { gender: GenderEnum; isExplicit: boolean } {
  if (!rawVal) return { gender: "UNKNOWN", isExplicit: false };
  const trimmed = rawVal.trim().toLowerCase();
  if (trimmed === "男" || trimmed === "male" || trimmed === "m" || trimmed === "1") {
    return { gender: "MALE", isExplicit: true };
  }
  if (trimmed === "女" || trimmed === "female" || trimmed === "f" || trimmed === "0" || trimmed === "2") {
    return { gender: "FEMALE", isExplicit: true };
  }
  return { gender: "UNKNOWN", isExplicit: false };
}

function detectDefaultMapping(columns: string[]): ImportMapping {
  let nameCol: string | null = null;
  let noCol: string | null = null;
  let genderCol: string | null = null;

  for (const col of columns) {
    const lower = col.toLowerCase();
    if (!nameCol && (lower.includes("姓名") || lower.includes("名字") || lower === "name" || lower === "student_name")) {
      nameCol = col;
    } else if (
      !noCol &&
      (lower.includes("学号") || lower.includes("学籍") || lower.includes("编号") || lower === "student_no" || lower === "studentno" || lower === "id")
    ) {
      noCol = col;
    } else if (!genderCol && (lower.includes("性别") || lower === "gender" || lower === "sex")) {
      genderCol = col;
    }
  }

  return {
    nameColumn: nameCol,
    studentNoColumn: noCol,
    genderColumn: genderCol,
  };
}

export function evaluateRows(rawRows: Record<string, string>[], mapping: ImportMapping): ParsedStudent[] {
  const seenNos = new Set<string>();
  const duplicateNos = new Set<string>();

  if (mapping.studentNoColumn) {
    rawRows.forEach((row) => {
      const no = mapping.studentNoColumn ? row[mapping.studentNoColumn]?.trim() : "";
      if (no) {
        if (seenNos.has(no)) {
          duplicateNos.add(no);
        } else {
          seenNos.add(no);
        }
      }
    });
  }

  return rawRows.map((row, index) => {
    const sourceRow = index + 1;
    const name = mapping.nameColumn ? row[mapping.nameColumn]?.trim() ?? "" : "";
    const studentNo = mapping.studentNoColumn ? row[mapping.studentNoColumn]?.trim() || null : null;
    const rawGender = mapping.genderColumn ? row[mapping.genderColumn]?.trim() : null;
    const { gender, isExplicit } = normalizeGender(rawGender);

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!name) {
      errors.push("姓名为空");
    }

    if (studentNo && duplicateNos.has(studentNo)) {
      warnings.push("表格内存在重复学号");
    }

    if (mapping.genderColumn && rawGender && !isExplicit) {
      warnings.push("未识别性别");
    }

    let status: ParsedStudent["status"] = "NORMAL";
    if (errors.length > 0) {
      status = "ERROR";
    } else if (warnings.length > 0) {
      status = "WARNING";
    }

    return {
      sourceRow,
      name,
      studentNo,
      gender,
      status,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  });
}

export async function parseFileContent(file: File): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { columns: [], rows: [] };
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    return { columns: [], rows: [] };
  }

  const rawGrid = XLSX.utils.sheet_to_json<string[]>(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  if (!rawGrid || rawGrid.length === 0) {
    return { columns: [], rows: [] };
  }

  // Locate the header row (first non-empty row)
  let headerRowIndex = 0;
  while (
    headerRowIndex < rawGrid.length &&
    (!rawGrid[headerRowIndex] || (rawGrid[headerRowIndex] as unknown[]).every((cell) => !String(cell ?? "").trim()))
  ) {
    headerRowIndex++;
  }

  if (headerRowIndex >= rawGrid.length) {
    return { columns: [], rows: [] };
  }

  const rawHeaders = (rawGrid[headerRowIndex] as unknown[]).map((cell, idx) => {
    const val = String(cell ?? "").trim();
    return val || `列 ${idx + 1}`;
  });

  const columns = rawHeaders;
  const rows: Record<string, string>[] = [];

  for (let r = headerRowIndex + 1; r < rawGrid.length; r++) {
    const rowValues = (rawGrid[r] as unknown[]) || [];
    const isRowEmpty = rowValues.every((cell) => !String(cell ?? "").trim());
    if (isRowEmpty) continue;

    const rowObj: Record<string, string> = {};
    columns.forEach((col, idx) => {
      rowObj[col] = String(rowValues[idx] ?? "").trim();
    });
    rows.push(rowObj);
  }

  return { columns, rows };
}

export async function parseStudentImportApi(file: File): Promise<ParseResult> {
  const fileName = file.name;
  const isCsv = fileName.toLowerCase().endsWith(".csv");
  const isXlsx = fileName.toLowerCase().endsWith(".xlsx") || fileName.toLowerCase().endsWith(".xls");

  if (!isCsv && !isXlsx) {
    throw new Error("仅支持 .xlsx 和 .csv 文件");
  }

  let parsed: { columns: string[]; rows: Record<string, string>[] };
  try {
    parsed = await parseFileContent(file);
  } catch {
    throw new Error("名单解析失败，请检查文件格式后重试");
  }

  const { columns, rows } = parsed;

  if (rows.length === 0) {
    throw new Error("文件中没有可导入的学生数据");
  }

  if (rows.length > 500) {
    throw new Error("单次最多导入 500 名学生");
  }

  const mapping = detectDefaultMapping(columns);
  const students = evaluateRows(rows, mapping);

  return {
    fileName,
    totalRows: rows.length,
    columns,
    mapping,
    students,
    rawRows: rows,
  };
}

export async function remapStudentImportApi(
  rawRows: Record<string, string>[],
  mapping: ImportMapping
): Promise<ParsedStudent[]> {
  return evaluateRows(rawRows, mapping);
}

export async function importStudentsApi(
  students: ImportStudentPayload[],
  existingStudentNos: Set<string>
): Promise<ImportResultData> {
  const skippedStudents: SkippedStudent[] = [];
  let importedCount = 0;

  for (const student of students) {
    if (student.studentNo && existingStudentNos.has(student.studentNo)) {
      skippedStudents.push({
        name: student.name,
        studentNo: student.studentNo,
        reason: "学号已存在于班级中",
      });
    } else {
      importedCount++;
    }
  }

  return {
    totalSubmitted: students.length,
    importedCount,
    skippedStudents,
  };
}
