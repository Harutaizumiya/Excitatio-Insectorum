import type { SaveClassScheduleInput, Weekday } from '@/lib';

import { parseFileContent } from '../student-import/student-import-api';

export interface ScheduleImportResult {
  entries: SaveClassScheduleInput['entries'];
  maxPeriodNo: number;
}

const WEEKDAY_HEADERS: Array<{ weekday: Weekday; labels: string[] }> = [
  { weekday: 1, labels: ['星期一', '周一'] },
  { weekday: 2, labels: ['星期二', '周二'] },
  { weekday: 3, labels: ['星期三', '周三'] },
  { weekday: 4, labels: ['星期四', '周四'] },
  { weekday: 5, labels: ['星期五', '周五'] },
  { weekday: 6, labels: ['星期六', '周六'] },
  { weekday: 7, labels: ['星期日', '星期天', '周日'] },
];

function normalizeCell(value: string | undefined): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function periodNumber(value: string | undefined): number | null {
  const match = normalizeCell(value).match(/^第\s*(\d+)\s*节$/);
  if (!match) return null;
  return Number(match[1]);
}

function findWeekdayColumns(header: string[]): Map<Weekday, number> {
  const columns = new Map<Weekday, number>();
  header.forEach((cell, index) => {
    const normalized = normalizeCell(cell);
    const weekday = WEEKDAY_HEADERS.find((item) => item.labels.includes(normalized))?.weekday;
    if (weekday !== undefined) columns.set(weekday, index);
  });
  return columns;
}

export async function parseScheduleFile(file: File): Promise<ScheduleImportResult> {
  const fileName = file.name.toLocaleLowerCase();
  if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
    throw new Error('仅支持 .xlsx、.xls 和 .csv 文件');
  }

  let content: Awaited<ReturnType<typeof parseFileContent>>;
  try {
    content = await parseFileContent(file);
  } catch {
    throw new Error('课表解析失败，请检查文件格式');
  }

  const headerIndex = content.grid.findIndex((row) => findWeekdayColumns(row).size > 0);
  if (headerIndex < 0) throw new Error('未识别课表表头');

  const weekdayColumns = findWeekdayColumns(content.grid[headerIndex]);
  if (weekdayColumns.size === 0) throw new Error('未识别课表星期列');

  const entries: ScheduleImportResult['entries'] = [];
  const entryKeys = new Set<string>();
  let maxPeriodNo = 0;

  for (const row of content.grid.slice(headerIndex + 1)) {
    const periodNo = periodNumber(row[0]);
    if (periodNo === null) continue;
    if (periodNo < 1 || periodNo > 12) throw new Error('课表节次必须在 1 至 12 节之间');
    maxPeriodNo = Math.max(maxPeriodNo, periodNo);

    weekdayColumns.forEach((column, weekday) => {
      const courseName = normalizeCell(row[column]);
      if (!courseName) return;
      const key = String(weekday) + '-' + String(periodNo);
      if (entryKeys.has(key)) throw new Error('课表存在重复课程格子');
      entryKeys.add(key);
      entries.push({ weekday, periodNo, courseName, classTeacherId: null });
    });
  }

  if (entries.length === 0) throw new Error('未读取到课程内容');
  return { entries, maxPeriodNo };
}
