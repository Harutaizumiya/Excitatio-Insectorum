import 'dotenv/config';
import {
  PrismaClient,
  SeatCellType,
  ScoreRecordType,
  TeacherRole,
  UserStatus,
} from '@repo/database';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();
const classId = 'class-1';
const headTeacherId = 'head-teacher';
const subjectTeacherId = 'subject-teacher';

const students = [
  ['stu-001', '张三', '01'],
  ['stu-002', '李四', '02'],
  ['stu-003', '王五', '03'],
  ['stu-004', '赵六', '04'],
  ['stu-005', '陈明', '05'],
  ['stu-006', '刘浩', '06'],
  ['stu-007', '周九', '07'],
  ['stu-008', '吴十', '08'],
  ['stu-009', '林悦', '09'],
  ['stu-010', '许安', '10'],
  ['stu-011', '孙晓', '11'],
  ['stu-012', '郑好', '12'],
] as const;

async function main(): Promise<void> {
  const headTeacherPasswordHash = await hash('admin123', 12);
  const subjectTeacherPasswordHash = await hash('classroom-demo', 12);
  await prisma.user.upsert({
    where: { id: headTeacherId },
    update: {
      name: '张沙',
      account: 'zhangsha',
      passwordHash: headTeacherPasswordHash,
      status: UserStatus.ACTIVE,
    },
    create: {
      id: headTeacherId,
      name: '张沙',
      account: 'zhangsha',
      passwordHash: headTeacherPasswordHash,
    },
  });
  await prisma.user.upsert({
    where: { id: subjectTeacherId },
    update: {
      name: '王老师',
      account: 'math.teacher',
      passwordHash: subjectTeacherPasswordHash,
      status: UserStatus.ACTIVE,
    },
    create: {
      id: subjectTeacherId,
      name: '王老师',
      account: 'math.teacher',
      passwordHash: subjectTeacherPasswordHash,
    },
  });

  await prisma.classroom.upsert({
    where: { id: classId },
    update: {
      name: '高一（10）班',
      grade: '高一年级',
      schoolYear: '2026',
      gridRows: 7,
      gridCols: 11,
      status: 'ACTIVE',
    },
    create: {
      id: classId,
      name: '高一（10）班',
      grade: '高一年级',
      schoolYear: '2026',
      gridRows: 7,
      gridCols: 11,
    },
  });

  await prisma.classTeacher.upsert({
    where: { id: 'class-teacher-head' },
    update: {
      classId,
      teacherId: headTeacherId,
      role: TeacherRole.HEAD_TEACHER,
      subject: null,
      status: 'ACTIVE',
    },
    create: {
      id: 'class-teacher-head',
      classId,
      teacherId: headTeacherId,
      role: TeacherRole.HEAD_TEACHER,
    },
  });
  await prisma.classTeacher.upsert({
    where: { id: 'class-teacher-math' },
    update: {
      classId,
      teacherId: subjectTeacherId,
      role: TeacherRole.SUBJECT_TEACHER,
      subject: '数学',
      status: 'ACTIVE',
    },
    create: {
      id: 'class-teacher-math',
      classId,
      teacherId: subjectTeacherId,
      role: TeacherRole.SUBJECT_TEACHER,
      subject: '数学',
    },
  });

  const periodTimes = [
    ['08:00', '08:40'],
    ['08:50', '09:30'],
    ['09:50', '10:30'],
    ['10:40', '11:20'],
    ['14:00', '14:40'],
    ['14:50', '15:30'],
    ['15:50', '16:30'],
    ['16:40', '17:20'],
  ] as const;
  for (const [templateId, name, offset] of [
    ['schedule-template-standard', '标准作息', 0],
    ['schedule-template-late', '晚起作息', 30],
  ] as const) {
    await prisma.scheduleTemplate.upsert({
      where: { id: templateId },
      update: { classId, name },
      create: { id: templateId, classId, name },
    });
    await prisma.scheduleTemplatePeriod.deleteMany({ where: { templateId } });
    await prisma.scheduleTemplatePeriod.createMany({
      data: periodTimes.map(([startTime, endTime], index) => {
        const shift = (value: string) => {
          const [hour, minute] = value.split(':').map(Number);
          const total = hour * 60 + minute + offset;
          return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
        };
        return {
          templateId,
          periodNo: index + 1,
          startTime: shift(startTime),
          endTime: shift(endTime),
        };
      }),
    });
  }
  await prisma.classroom.update({
    where: { id: classId },
    data: { activeScheduleTemplateId: 'schedule-template-standard' },
  });
  await prisma.scheduleEntry.deleteMany({ where: { classId } });
  const courses = [
    ['语文', 'class-teacher-head'],
    ['数学', 'class-teacher-math'],
    ['英语', null],
    ['物理', null],
    ['化学', null],
    ['历史', null],
    ['生物', null],
    ['自习', null],
  ] as const;
  await prisma.scheduleEntry.createMany({
    data: Array.from({ length: 5 * courses.length }, (_, index) => ({
      id: `schedule-entry-${Math.floor(index / courses.length) + 1}-${(index % courses.length) + 1}`,
      classId,
      weekday: Math.floor(index / courses.length) + 1,
      periodNo: (index % courses.length) + 1,
      courseName: courses[index % courses.length][0],
      classTeacherId: courses[index % courses.length][1],
    })),
  });

  for (const [id, name, studentNo] of students) {
    await prisma.student.upsert({
      where: { id },
      update: { classId, name, studentNo, status: 'ACTIVE' },
      create: { id, classId, name, studentNo },
    });
  }

  const ruleDefinitions = [
    ['rule-answer', '回答问题', '课堂表现', 2, '积极回答课堂问题'],
    ['rule-participate', '积极参与', '课堂表现', 1, '参与讨论与课堂活动'],
    ['rule-help', '帮助同学', '品格表现', 2, '主动帮助同学完成学习任务'],
    ['rule-discipline', '课堂纪律', '课堂表现', -2, '课堂纪律提醒'],
  ] as const;
  for (const [id, name, group, delta, description] of ruleDefinitions) {
    await prisma.scoreRule.upsert({
      where: { id },
      update: { classId, name, group, delta, description, enabled: true, createdBy: headTeacherId },
      create: { id, classId, name, group, delta, description, createdBy: headTeacherId },
    });
  }

  const layoutId = 'layout-v1';
  await prisma.seatLayoutVersion.upsert({
    where: { id: layoutId },
    update: { classId, version: 1, sourceVersionId: null, createdBy: headTeacherId },
    create: { id: layoutId, classId, version: 1, createdBy: headTeacherId },
  });
  await prisma.seat.deleteMany({ where: { layoutVersionId: layoutId } });
  const studentCells = new Map([
    ['1-0', 'stu-001'],
    ['1-1', 'stu-002'],
    ['1-3', 'stu-003'],
    ['1-4', 'stu-004'],
    ['1-6', 'stu-005'],
    ['1-7', 'stu-006'],
    ['1-9', 'stu-007'],
  ]);
  await prisma.seat.createMany({
    data: Array.from({ length: 77 }, (_, index) => {
      const rowIndex = Math.floor(index / 11);
      const colIndex = index % 11;
      const key = `${rowIndex}-${colIndex}`;
      return {
        layoutVersionId: layoutId,
        rowIndex,
        colIndex,
        studentId: studentCells.get(key) ?? null,
        cellType:
          rowIndex === 0 && colIndex === 4
            ? SeatCellType.PODIUM
            : rowIndex === 0
              ? SeatCellType.EMPTY
              : [2, 5, 8].includes(colIndex)
                ? SeatCellType.AISLE
                : SeatCellType.SEAT,
      };
    }),
  });
  await prisma.classroom.update({
    where: { id: classId },
    data: { currentLayoutVersionId: layoutId },
  });

  await prisma.scoreRecord.upsert({
    where: { id: 'record-001' },
    update: {
      classId,
      studentId: 'stu-001',
      operatorId: subjectTeacherId,
      subject: '数学',
      ruleId: 'rule-answer',
      delta: 2,
      reason: null,
      recordType: ScoreRecordType.NORMAL,
      revertedRecordId: null,
    },
    create: {
      id: 'record-001',
      classId,
      studentId: 'stu-001',
      operatorId: subjectTeacherId,
      subject: '数学',
      ruleId: 'rule-answer',
      delta: 2,
      recordType: ScoreRecordType.NORMAL,
    },
  });
  await prisma.scoreRecord.upsert({
    where: { id: 'record-002' },
    update: {
      classId,
      studentId: 'stu-002',
      operatorId: headTeacherId,
      subject: '数学',
      ruleId: 'rule-participate',
      delta: 1,
      reason: '小组讨论积极',
      recordType: ScoreRecordType.NORMAL,
      revertedRecordId: null,
    },
    create: {
      id: 'record-002',
      classId,
      studentId: 'stu-002',
      operatorId: headTeacherId,
      subject: '数学',
      ruleId: 'rule-participate',
      delta: 1,
      reason: '小组讨论积极',
      recordType: ScoreRecordType.NORMAL,
    },
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
