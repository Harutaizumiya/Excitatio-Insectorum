import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { StudentGender } from '@prisma/client';
import { ClassroomsService } from '../../classrooms';
import { PrismaService } from '../../prisma';
import { RealtimeService } from '../../realtime';
import { StudentImportService } from './student-import.service';

function createFile(originalname: string, contents: string): Express.Multer.File {
  const buffer = Buffer.from(contents, 'utf8');
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'text/csv',
    stream: Readable.from(buffer),
    size: buffer.length,
    destination: '',
    filename: originalname,
    path: '',
    buffer,
  };
}

async function createXlsxFile(rows: Array<Array<unknown>>): Promise<Express.Multer.File> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('名单').addRows(rows);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    fieldname: 'file',
    originalname: 'students.xlsx',
    encoding: '7bit',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    stream: Readable.from(buffer),
    size: buffer.length,
    destination: '',
    filename: 'students.xlsx',
    path: '',
    buffer,
  };
}

function createParserService() {
  const classrooms = { assertAccess: jest.fn().mockResolvedValue({ role: 'HEAD_TEACHER' }) };
  const prisma = {} as PrismaService;
  const realtime = { publishClassEvent: jest.fn() };
  return {
    service: new StudentImportService(
      prisma,
      classrooms as unknown as ClassroomsService,
      realtime as unknown as RealtimeService,
    ),
    classrooms,
  };
}

describe('StudentImportService.parse', () => {
  it('parses a standard Excel worksheet and keeps student numbers as strings', async () => {
    const { service } = createParserService();
    const file = await createXlsxFile([
      ['姓名', '学号', '性别'],
      [' 张三 ', 20260101, '男'],
      ['李四', '00123', 'Female'],
    ]);

    await expect(service.parse('teacher-1', 'class-1', file)).resolves.toMatchObject({
      sheetName: '名单',
      headerRow: 1,
      totalRows: 2,
      validRows: 2,
      mapping: { name: '姓名', studentNo: '学号', gender: '性别' },
      students: [
        { sourceRow: 2, name: '张三', studentNo: '20260101', gender: StudentGender.MALE },
        { sourceRow: 3, name: '李四', studentNo: '00123', gender: StudentGender.FEMALE },
      ],
    });
  });

  it('detects a header on row three and ignores unrelated columns', async () => {
    const { service } = createParserService();
    const file = createFile(
      'students.csv',
      '课序导出文件,,,\n班主任,王老师,,\n班级,姓名,性别,其他\n一班,张三,男,备注',
    );

    await expect(service.parse('teacher-1', 'class-1', file)).resolves.toMatchObject({
      headerRow: 3,
      columns: ['班级', '姓名', '性别', '其他'],
      students: [{ sourceRow: 4, name: '张三', studentNo: null, gender: StudentGender.MALE }],
    });
  });

  it('supports aliases, manual remapping, and unknown gender normalization', async () => {
    const { service } = createParserService();
    const file = createFile(
      'students.csv',
      '班级,学生姓名,学籍号,男女\n一班,张三,00123,其他\n一班,,00124,女',
    );
    const result = await service.parse('teacher-1', 'class-1', file);
    expect(result.mapping).toEqual({ name: '学生姓名', studentNo: '学籍号', gender: '男女' });
    expect(result.students).toEqual([
      { sourceRow: 2, name: '张三', studentNo: '00123', gender: StudentGender.UNKNOWN },
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceRow: 2, code: 'UNKNOWN_GENDER' }),
        expect.objectContaining({ sourceRow: 3, code: 'EMPTY_NAME' }),
      ]),
    );

    const remapped = await service.parse(
      'teacher-1',
      'class-1',
      createFile('generic.csv', 'group,full name,code,sex\n一班,李四,00007,M'),
      JSON.stringify({ name: 'full name', studentNo: 'code', gender: 'sex' }),
    );
    expect(remapped.students).toEqual([
      { sourceRow: 2, name: '李四', studentNo: '00007', gender: StudentGender.MALE },
    ]);
  });

  it('handles CSV BOM and Windows line endings', async () => {
    const { service } = createParserService();
    const file = createFile('students.csv', '\uFEFF姓名,性别\r\n王五,女生\r\n');
    await expect(service.parse('teacher-1', 'class-1', file)).resolves.toMatchObject({
      students: [{ name: '王五', studentNo: null, gender: StudentGender.FEMALE }],
    });
  });

  it('rejects unsupported, empty, name-less, and oversized inputs', async () => {
    const { service } = createParserService();
    await expect(
      service.parse('teacher-1', 'class-1', createFile('students.txt', '姓名\n张三')),
    ).rejects.toMatchObject({
      code: 'STUDENT_IMPORT_FILE_TYPE_UNSUPPORTED',
    });
    await expect(
      service.parse('teacher-1', 'class-1', createFile('students.csv', '')),
    ).rejects.toMatchObject({
      code: 'STUDENT_IMPORT_EMPTY_FILE',
    });
    await expect(
      service.parse('teacher-1', 'class-1', createFile('students.csv', '班级,性别\n一班,男')),
    ).rejects.toMatchObject({
      code: 'STUDENT_IMPORT_NAME_COLUMN_NOT_FOUND',
    });

    const rows = ['姓名', ...Array.from({ length: 501 }, (_, index) => `学生${index}`)].join('\n');
    await expect(
      service.parse('teacher-1', 'class-1', createFile('students.csv', rows)),
    ).rejects.toMatchObject({
      code: 'STUDENT_IMPORT_TOO_MANY_ROWS',
    });
  });
});

describe('StudentImportService.importStudents', () => {
  it('skips existing and in-request duplicates in one transaction', async () => {
    const existing = [{ id: 'student-existing', name: '张三', studentNo: '1001' }];
    const transaction = {
      student: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce([{ id: 'student-new' }]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as unknown as PrismaService;
    const classrooms = {
      assertAccess: jest.fn().mockResolvedValue({ role: 'HEAD_TEACHER' }),
    } as unknown as ClassroomsService;
    const realtime = { publishClassEvent: jest.fn() } as unknown as RealtimeService;
    const service = new StudentImportService(prisma, classrooms, realtime);

    await expect(
      service.importStudents('teacher-1', 'class-1', [
        { name: '张三', studentNo: '1001', gender: StudentGender.MALE },
        { name: '李四', studentNo: null, gender: StudentGender.UNKNOWN },
        { name: '李四', studentNo: null, gender: StudentGender.FEMALE },
      ]),
    ).resolves.toMatchObject({
      created: 1,
      skipped: 2,
      duplicates: [
        { name: '张三', reason: 'STUDENT_ALREADY_EXISTS' },
        { name: '李四', reason: 'DUPLICATE_IN_IMPORT' },
      ],
    });
    expect(transaction.student.createMany).toHaveBeenCalledWith({
      data: [{ classId: 'class-1', name: '李四', studentNo: null, gender: StudentGender.UNKNOWN }],
      skipDuplicates: true,
    });
    expect(realtime.publishClassEvent).toHaveBeenCalledTimes(1);
  });
});
