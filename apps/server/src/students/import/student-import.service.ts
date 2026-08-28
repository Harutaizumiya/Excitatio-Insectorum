import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { StudentGender, TeacherRole } from '@prisma/client';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { BusinessException, ClassEventType } from '../../common';
import { ClassroomsService } from '../../classrooms';
import { PrismaService } from '../../prisma';
import { RealtimeService } from '../../realtime';
import {
  FIELD_ALIASES,
  MAX_HEADER_SCAN_ROWS,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_RECORDS,
  SUPPORTED_IMPORT_EXTENSIONS,
  type ImportField,
} from './student-import.constants';
import type {
  ImportColumnMapping,
  ImportDuplicate,
  ImportInvalidStudent,
  ImportMappingInput,
  ImportedStudent,
  ImportWarning,
  StudentImportParseResult,
  StudentImportResult,
} from './student-import.types';

export interface StudentImportFile {
  originalname: string;
  buffer: Buffer;
  size?: number;
}

interface SourceCell {
  value: unknown;
  text?: string;
  numberFormat?: string;
}

interface SourceRow {
  sourceRow: number;
  cells: SourceCell[];
}

interface DetectedMapping extends ImportColumnMapping {
  indexes: Partial<Record<ImportField, number>>;
}

interface HeaderCandidate {
  row: SourceRow;
  headers: string[];
  mapping: DetectedMapping;
  score: number;
}

const EMPTY_MAPPING: ImportColumnMapping = { name: null, studentNo: null, gender: null };

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, '');
}

export function normalizeGender(value: unknown): StudentGender {
  const normalized = String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase();

  if (['男', '男生', 'm', 'male'].includes(normalized)) {
    return StudentGender.MALE;
  }
  if (['女', '女生', 'f', 'female'].includes(normalized)) {
    return StudentGender.FEMALE;
  }
  return StudentGender.UNKNOWN;
}

export function normalizeStudentNo(value: unknown, numberFormat?: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  let normalized: string;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const integerValue = Number.isInteger(value) ? String(value) : String(value);
    const zeroFormat = numberFormat?.match(/^0+$/);
    normalized = zeroFormat ? integerValue.padStart(zeroFormat[0].length, '0') : integerValue;
  } else {
    normalized = String(value);
  }

  const trimmed = normalized.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function detectColumnMapping(headers: string[]): DetectedMapping {
  const indexes: Partial<Record<ImportField, number>> = {};
  const mapping: ImportColumnMapping = { ...EMPTY_MAPPING };

  for (const field of Object.keys(FIELD_ALIASES) as ImportField[]) {
    const aliases = new Set(FIELD_ALIASES[field].map(normalizeHeader));
    const index = headers.findIndex((header) => aliases.has(normalizeHeader(header)));
    if (index >= 0) {
      indexes[field] = index;
      mapping[field] = headers[index] ?? null;
    }
  }

  return { ...mapping, indexes };
}

export function detectHeaderRow(
  rows: SourceRow[],
  manualMapping?: ImportMappingInput,
): HeaderCandidate {
  const candidates = rows.slice(0, MAX_HEADER_SCAN_ROWS).map((row) => {
    const headers = row.cells.map((cell, index) => cellToText(cell) || `列 ${index + 1}`);
    const automatic = detectColumnMapping(headers);
    const requested = manualMapping ? requestedMapping(manualMapping) : null;
    const mapping = requested ? mapRequestedColumns(headers, requested) : automatic;
    const score = (Object.keys(mapping.indexes) as ImportField[]).length;
    return { row, headers, mapping, score };
  });

  const valid = candidates.filter((candidate) => candidate.mapping.indexes.name !== undefined);
  const best = valid.sort(
    (left, right) => right.score - left.score || left.row.sourceRow - right.row.sourceRow,
  )[0];
  if (!best) {
    throw new BusinessException(
      'STUDENT_IMPORT_NAME_COLUMN_NOT_FOUND',
      '无法识别姓名列，请检查表头或重新上传并指定姓名列',
      HttpStatus.BAD_REQUEST,
    );
  }

  return best;
}

export function cellToText(cell: SourceCell): string {
  const value = unwrapCellValue(cell.value);
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return cell.text ?? value.toISOString();
  }
  return String(value);
}

function unwrapCellValue(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if ('result' in value) {
    return (value as { result?: unknown }).result;
  }
  if ('richText' in value && Array.isArray((value as { richText?: unknown }).richText)) {
    return (value as { richText: Array<{ text?: string }> }).richText
      .map((part) => part.text ?? '')
      .join('');
  }
  if ('text' in value) {
    return (value as { text?: unknown }).text;
  }
  return value;
}

function requestedMapping(input: ImportMappingInput): ImportColumnMapping {
  return {
    name: input.name ?? input.nameColumn ?? null,
    studentNo: input.studentNo ?? input.studentNoColumn ?? null,
    gender: input.gender ?? input.genderColumn ?? null,
  };
}

function mapRequestedColumns(headers: string[], requested: ImportColumnMapping): DetectedMapping {
  const mapping: ImportColumnMapping = { ...EMPTY_MAPPING };
  const indexes: Partial<Record<ImportField, number>> = {};
  for (const field of Object.keys(mapping) as ImportField[]) {
    const requestedValue = requested[field];
    if (!requestedValue) continue;
    const index = headers.findIndex(
      (header) => normalizeHeader(header) === normalizeHeader(requestedValue),
    );
    if (index >= 0) {
      indexes[field] = index;
      mapping[field] = headers[index] ?? null;
    }
  }
  return { ...mapping, indexes };
}

function sourceCellValue(row: SourceRow, index: number | undefined): SourceCell | undefined {
  return index === undefined ? undefined : row.cells[index];
}

function sourceRowIsEmpty(row: SourceRow): boolean {
  return row.cells.every((cell) => cellToText(cell).trim() === '');
}

function rowLooksLikeHeader(row: SourceRow, header: HeaderCandidate): boolean {
  const mappedFields = (Object.keys(header.mapping.indexes) as ImportField[]).filter(
    (field) => header.mapping.indexes[field] !== undefined,
  );
  return (
    mappedFields.length > 0 &&
    mappedFields.every((field) => {
      const index = header.mapping.indexes[field];
      const headerValue = header.headers[index ?? -1];
      return (
        normalizeHeader(cellToText(sourceCellValue(row, index ?? -1) ?? { value: '' })) ===
        normalizeHeader(headerValue)
      );
    })
  );
}

function buildStudents(
  rows: SourceRow[],
  header: HeaderCandidate,
): { students: Array<ImportedStudent & { sourceRow: number }>; warnings: ImportWarning[] } {
  const students: Array<ImportedStudent & { sourceRow: number }> = [];
  const warnings: ImportWarning[] = [];

  for (const row of rows) {
    if (rowLooksLikeHeader(row, header)) {
      warnings.push({
        sourceRow: row.sourceRow,
        code: 'DUPLICATE_HEADER',
        message: '忽略重复表头行',
      });
      continue;
    }

    const name = cellToText(
      sourceCellValue(row, header.mapping.indexes.name) ?? { value: '' },
    ).trim();
    if (!name) {
      warnings.push({
        sourceRow: row.sourceRow,
        code: 'EMPTY_NAME',
        message: '姓名为空，已忽略该行',
      });
      continue;
    }
    if (name.length > 100) {
      warnings.push({
        sourceRow: row.sourceRow,
        code: 'NAME_TOO_LONG',
        message: '姓名超过 100 个字符，已忽略该行',
      });
      continue;
    }

    const studentNoCell = sourceCellValue(row, header.mapping.indexes.studentNo);
    const studentNo = normalizeStudentNo(studentNoCell?.value, studentNoCell?.numberFormat);
    if (studentNo && studentNo.length > 50) {
      warnings.push({
        sourceRow: row.sourceRow,
        code: 'STUDENT_NO_TOO_LONG',
        message: '学号超过 50 个字符，已忽略该行',
      });
      continue;
    }

    const genderCell = sourceCellValue(row, header.mapping.indexes.gender);
    const rawGender = cellToText(genderCell ?? { value: '' }).trim();
    const gender = normalizeGender(rawGender);
    if (rawGender && gender === StudentGender.UNKNOWN) {
      warnings.push({
        sourceRow: row.sourceRow,
        code: 'UNKNOWN_GENDER',
        message: '性别无法识别，已转换为 UNKNOWN',
      });
    }

    students.push({ sourceRow: row.sourceRow, name, studentNo, gender });
  }

  return { students, warnings };
}

function trimTrailingEmptyRows(rows: SourceRow[]): SourceRow[] {
  const result = [...rows];
  while (result.length > 0 && sourceRowIsEmpty(result[result.length - 1]!)) {
    result.pop();
  }
  return result;
}

async function readXlsx(buffer: Buffer): Promise<Array<{ sheetName: string; rows: SourceRow[] }>> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new BusinessException(
      'STUDENT_IMPORT_FILE_INVALID',
      'Excel 文件无法解析',
      HttpStatus.BAD_REQUEST,
    );
  }

  const sources: Array<{ sheetName: string; rows: SourceRow[] }> = [];
  for (const worksheet of workbook.worksheets) {
    const rowLimit = Math.min(worksheet.rowCount, MAX_HEADER_SCAN_ROWS + MAX_IMPORT_RECORDS + 1);
    const rows: SourceRow[] = [];
    for (let rowNumber = 1; rowNumber <= rowLimit; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const cells: SourceCell[] = [];
      for (let index = 1; index <= row.cellCount; index += 1) {
        let cell = row.getCell(index);
        if (cell.isMerged && cell.master) {
          cell = cell.master;
        }
        cells.push({ value: cell.value, text: cell.text, numberFormat: cell.numFmt });
      }
      rows.push({ sourceRow: rowNumber, cells });
    }

    const trimmedRows = trimTrailingEmptyRows(rows);
    if (trimmedRows.length > 0) {
      sources.push({ sheetName: worksheet.name, rows: trimmedRows });
    }
  }

  if (sources.length === 0) {
    throw new BusinessException(
      'STUDENT_IMPORT_EMPTY_FILE',
      '文件中没有可读取的内容',
      HttpStatus.BAD_REQUEST,
    );
  }
  return sources;
}

function readCsv(buffer: Buffer): { sheetName: string; rows: SourceRow[] } {
  let records: unknown[][];
  try {
    records = parseCsv(buffer.toString('utf8'), {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: false,
    }) as unknown[][];
  } catch {
    throw new BusinessException(
      'STUDENT_IMPORT_FILE_INVALID',
      'CSV 文件无法解析',
      HttpStatus.BAD_REQUEST,
    );
  }
  const rows = records.map((record, index) => ({
    sourceRow: index + 1,
    cells: (record ?? []).map((value) => ({ value: value ?? '' })),
  }));
  const trimmedRows = trimTrailingEmptyRows(rows);
  if (trimmedRows.length === 0) {
    throw new BusinessException(
      'STUDENT_IMPORT_EMPTY_FILE',
      '文件中没有可读取的内容',
      HttpStatus.BAD_REQUEST,
    );
  }
  return { sheetName: 'CSV', rows: trimmedRows };
}

function parseMappingInput(input?: string): ImportMappingInput | undefined {
  if (!input || input.trim().length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new BusinessException(
      'STUDENT_IMPORT_MAPPING_INVALID',
      '字段映射必须是有效 JSON',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BusinessException(
      'STUDENT_IMPORT_MAPPING_INVALID',
      '字段映射格式不正确',
      HttpStatus.BAD_REQUEST,
    );
  }
  const value = parsed as Record<string, unknown>;
  const allowedKeys = [
    'name',
    'studentNo',
    'gender',
    'nameColumn',
    'studentNoColumn',
    'genderColumn',
  ];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new BusinessException(
      'STUDENT_IMPORT_MAPPING_INVALID',
      '字段映射包含未知字段',
      HttpStatus.BAD_REQUEST,
    );
  }
  for (const key of allowedKeys) {
    if (key in value && value[key] !== null && typeof value[key] !== 'string') {
      throw new BusinessException(
        'STUDENT_IMPORT_MAPPING_INVALID',
        '字段映射列名必须是字符串或 null',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
  return value as ImportMappingInput;
}

function validateManualMapping(header: HeaderCandidate, manualMapping?: ImportMappingInput): void {
  if (!manualMapping) return;
  const requested = requestedMapping(manualMapping);
  for (const field of Object.keys(requested) as ImportField[]) {
    if (requested[field] && header.mapping.indexes[field] === undefined) {
      throw new BusinessException(
        'STUDENT_IMPORT_MAPPING_INVALID',
        `映射列不存在：${requested[field]}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}

function ensureRecordLimit(rows: SourceRow[], headerRow: number): void {
  const dataRows = rows.filter((row) => row.sourceRow > headerRow);
  if (dataRows.length > MAX_IMPORT_RECORDS) {
    throw new BusinessException(
      'STUDENT_IMPORT_TOO_MANY_ROWS',
      `单次最多导入 ${MAX_IMPORT_RECORDS} 条学生记录`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

function studentKey(student: Pick<ImportedStudent, 'name' | 'studentNo'>): string {
  return student.studentNo ? `studentNo:${student.studentNo}` : `name:${student.name}`;
}

@Injectable()
export class StudentImportService {
  private readonly logger = new Logger(StudentImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classrooms: ClassroomsService,
    private readonly realtime: RealtimeService,
  ) {}

  async parse(
    userId: string,
    classId: string,
    file: StudentImportFile | undefined,
    mappingInput?: string,
  ): Promise<StudentImportParseResult> {
    await this.classrooms.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    if (!file) {
      throw new BusinessException(
        'STUDENT_IMPORT_FILE_REQUIRED',
        '请上传 Excel 或 CSV 文件',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BusinessException(
        'STUDENT_IMPORT_EMPTY_FILE',
        '上传文件为空',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (file.buffer.length > MAX_IMPORT_FILE_SIZE_BYTES) {
      throw new BusinessException(
        'STUDENT_IMPORT_FILE_TOO_LARGE',
        '文件大小不能超过 5MB',
        HttpStatus.BAD_REQUEST,
      );
    }

    const extension = file.originalname
      .slice(file.originalname.lastIndexOf('.'))
      .toLocaleLowerCase();
    if (!(SUPPORTED_IMPORT_EXTENSIONS as readonly string[]).includes(extension)) {
      throw new BusinessException(
        'STUDENT_IMPORT_FILE_TYPE_UNSUPPORTED',
        '仅支持 .xlsx 和 .csv 文件',
        HttpStatus.BAD_REQUEST,
      );
    }

    const manualMapping = parseMappingInput(mappingInput);
    const sources = extension === '.csv' ? [readCsv(file.buffer)] : await readXlsx(file.buffer);
    let source: { sheetName: string; rows: SourceRow[] } | undefined;
    let header: HeaderCandidate | undefined;
    for (const candidateSource of sources) {
      try {
        const candidateHeader = detectHeaderRow(candidateSource.rows, manualMapping);
        source = candidateSource;
        header = candidateHeader;
        break;
      } catch (error) {
        if (
          !(error instanceof BusinessException) ||
          error.code !== 'STUDENT_IMPORT_NAME_COLUMN_NOT_FOUND'
        ) {
          throw error;
        }
      }
    }
    if (!source || !header) {
      throw new BusinessException(
        'STUDENT_IMPORT_NAME_COLUMN_NOT_FOUND',
        '无法识别姓名列，请检查表头或重新上传并指定姓名列',
        HttpStatus.BAD_REQUEST,
      );
    }
    validateManualMapping(header, manualMapping);
    const dataRows = source.rows.filter((row) => row.sourceRow > header.row.sourceRow);
    ensureRecordLimit(source.rows, header.row.sourceRow);
    const parsed = buildStudents(dataRows, header);

    return {
      fileName: file.originalname,
      sheetName: source.sheetName,
      headerRow: header.row.sourceRow,
      totalRows: dataRows.length,
      validRows: parsed.students.length,
      mapping: {
        name: header.mapping.name,
        studentNo: header.mapping.studentNo,
        gender: header.mapping.gender,
      },
      columns: header.headers,
      students: parsed.students,
      warnings: parsed.warnings,
    };
  }

  async importStudents(
    userId: string,
    classId: string,
    input: ReadonlyArray<Partial<ImportedStudent>>,
  ): Promise<StudentImportResult> {
    await this.classrooms.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    if (!Array.isArray(input) || input.length > MAX_IMPORT_RECORDS) {
      throw new BusinessException(
        'STUDENT_IMPORT_TOO_MANY_ROWS',
        `单次最多导入 ${MAX_IMPORT_RECORDS} 条学生记录`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.student.findMany({
        where: { classId },
        select: { id: true, name: true, studentNo: true },
      });
      const existingKeys = new Set(
        existing.map((student) =>
          studentKey({
            name: student.name.trim(),
            studentNo: student.studentNo?.trim() || null,
          }),
        ),
      );
      const seenKeys = new Set<string>();
      const candidates: ImportedStudent[] = [];
      const duplicates: ImportDuplicate[] = [];
      const errors: ImportInvalidStudent[] = [];
      let createdStudentIds: string[] = [];

      for (const raw of input) {
        const name = typeof raw.name === 'string' ? raw.name.trim() : '';
        const studentNo = normalizeStudentNo(raw.studentNo);
        const gender = raw.gender ?? StudentGender.UNKNOWN;
        if (!name || name.length > 100 || (studentNo !== null && studentNo.length > 50)) {
          errors.push({ name, studentNo, reason: 'INVALID_STUDENT_DATA' });
          continue;
        }
        const student = { name, studentNo, gender } satisfies ImportedStudent;
        const key = studentKey(student);
        if (existingKeys.has(key)) {
          duplicates.push({ name, studentNo, reason: 'STUDENT_ALREADY_EXISTS' });
        } else if (seenKeys.has(key)) {
          duplicates.push({ name, studentNo, reason: 'DUPLICATE_IN_IMPORT' });
        } else {
          seenKeys.add(key);
          candidates.push(student);
        }
      }

      let created = 0;
      if (candidates.length > 0) {
        const createdResult = await transaction.student.createMany({
          data: candidates.map((student) => ({ classId, ...student })),
          skipDuplicates: true,
        });
        created = createdResult.count;
        const persisted = await transaction.student.findMany({
          where: {
            classId,
            OR: candidates.map((student) =>
              student.studentNo
                ? { studentNo: student.studentNo }
                : { name: student.name, studentNo: null },
            ),
          },
          select: { id: true },
        });
        createdStudentIds = persisted.map((student) => student.id);
        const raceSkipped = candidates.length - created;
        if (raceSkipped > 0) {
          for (const student of candidates.slice(-raceSkipped)) {
            duplicates.push({ ...student, reason: 'STUDENT_ALREADY_EXISTS' });
          }
        }
      }

      return {
        created,
        skipped: duplicates.length + errors.length,
        duplicates,
        errors,
        createdStudentIds,
      };
    });

    for (const studentId of result.createdStudentIds) {
      await this.publishStudentChanged(classId, studentId);
    }

    this.logger.log(
      `Imported students into class ${classId}: created=${result.created}, skipped=${result.skipped}`,
    );
    return {
      created: result.created,
      skipped: result.skipped,
      duplicates: result.duplicates,
      errors: result.errors,
    };
  }

  private async publishStudentChanged(classId: string, studentId: string): Promise<void> {
    try {
      await Promise.resolve(
        this.realtime.publishClassEvent(classId, {
          id: `${classId}-${studentId}-${Date.now()}`,
          type: ClassEventType.STUDENT_CHANGED,
          classId,
          occurredAt: new Date().toISOString(),
          payload: { studentId, action: 'CREATED' },
        }),
      );
    } catch (error) {
      this.logger.error(`Realtime publication failed after student import: ${String(error)}`);
    }
  }
}
