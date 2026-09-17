export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_RECORDS = 500;
export const MAX_HEADER_SCAN_ROWS = 10;

export const SUPPORTED_IMPORT_EXTENSIONS = ['.xlsx', '.csv'] as const;

export const FIELD_ALIASES = {
  name: ['姓名', '学生姓名', '学生名字', '名字', 'name'],
  studentNo: ['学号', '学籍号', '学生编号', '编号', 'student no', 'student id'],
  gender: ['性别', '男女', 'gender'],
} as const;

export type ImportField = keyof typeof FIELD_ALIASES;
