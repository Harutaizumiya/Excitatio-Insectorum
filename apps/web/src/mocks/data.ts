import type {
  Classroom,
  ClassTeacher,
  ScoreRule,
  ScorePeriod,
  Seat,
  SeatLayoutVersion,
  Student,
} from "@/lib/domain"

import type {
  MockDatabaseState,
  MockDisplayDevice,
  MockScheduleEntry,
  MockScheduleTemplate,
  MockScoreRecord,
} from "./types"

export const MOCK_CLASS_ID = "class-1"
export const MOCK_HEAD_TEACHER_ID = "teacher-lin"
export const MOCK_CURRENT_WEEK_START = "2026-08-24T00:00:00.000Z"
export const MOCK_CURRENT_WEEK_END = "2026-08-31T00:00:00.000Z"

const ACTIVE_STUDENT_NAMES = [
  "陈思远",
  "林语桐",
  "王子谦",
  "张若晴",
  "李承泽",
  "吴佳宁",
  "黄宇轩",
  "赵可欣",
  "周明哲",
  "徐安然",
  "孙浩然",
  "郑雨彤",
  "何俊熙",
  "郭芷涵",
  "罗景程",
  "梁心怡",
  "宋睿扬",
  "唐诗涵",
  "许嘉佑",
  "邓依诺",
  "冯博文",
  "曹悦宁",
  "彭奕辰",
  "曾语馨",
  "谢昊宇",
  "叶书瑶",
  "苏靖凯",
  "潘思妤",
  "杜星野",
  "蒋沐橙",
] as const

function studentId(index: number): string {
  return `student-${String(index + 1).padStart(2, "0")}`
}

function createStudents(): Student[] {
  const active = ACTIVE_STUDENT_NAMES.map<Student>((name, index) => ({
    id: studentId(index),
    classId: MOCK_CLASS_ID,
    name,
    studentNo: `202601${String(index + 1).padStart(2, "0")}`,
    status: "ACTIVE",
    createdAt: "2026-08-01T01:00:00.000Z",
    updatedAt: "2026-08-20T08:00:00.000Z",
  }))

  return [
    ...active,
    {
      id: "student-history-zhou",
      classId: MOCK_CLASS_ID,
      name: "周念慈",
      studentNo: "20260098",
      status: "INACTIVE",
      createdAt: "2026-02-10T01:00:00.000Z",
      updatedAt: "2026-08-12T03:20:00.000Z",
    },
    {
      id: "student-history-gu",
      classId: MOCK_CLASS_ID,
      name: "顾晨曦",
      studentNo: "20260099",
      status: "INACTIVE",
      createdAt: "2026-02-10T01:00:00.000Z",
      updatedAt: "2026-07-05T06:45:00.000Z",
    },
  ]
}

function createTeachers(): ClassTeacher[] {
  return [
    {
      id: "relation-head-lin",
      classId: MOCK_CLASS_ID,
      teacherId: MOCK_HEAD_TEACHER_ID,
      role: "HEAD_TEACHER",
      subject: "语文",
      status: "ACTIVE",
      createdAt: "2026-02-01T02:00:00.000Z",
      updatedAt: "2026-08-20T02:00:00.000Z",
      teacher: { id: MOCK_HEAD_TEACHER_ID, name: "张沙", status: "ACTIVE" },
    },
    {
      id: "relation-wang-math",
      classId: MOCK_CLASS_ID,
      teacherId: "teacher-wang",
      role: "SUBJECT_TEACHER",
      subject: "数学",
      status: "ACTIVE",
      createdAt: "2026-02-12T02:00:00.000Z",
      updatedAt: "2026-08-25T02:00:00.000Z",
      teacher: { id: "teacher-wang", name: "王建国", status: "ACTIVE" },
    },
    {
      id: "relation-chen-english",
      classId: MOCK_CLASS_ID,
      teacherId: "teacher-chen",
      role: "SUBJECT_TEACHER",
      subject: "英语",
      status: "ACTIVE",
      createdAt: "2026-02-12T02:10:00.000Z",
      updatedAt: "2026-08-24T08:10:00.000Z",
      teacher: { id: "teacher-chen", name: "陈婉如", status: "ACTIVE" },
    },
    {
      id: "relation-li-physics",
      classId: MOCK_CLASS_ID,
      teacherId: "teacher-li",
      role: "SUBJECT_TEACHER",
      subject: "物理",
      status: "ACTIVE",
      createdAt: "2026-02-12T02:20:00.000Z",
      updatedAt: "2026-08-22T05:00:00.000Z",
      teacher: { id: "teacher-li", name: "李明哲", status: "ACTIVE" },
    },
    {
      id: "relation-history-zhao",
      classId: MOCK_CLASS_ID,
      teacherId: "teacher-zhao",
      role: "SUBJECT_TEACHER",
      subject: "历史",
      status: "REVOKED",
      createdAt: "2026-02-12T02:30:00.000Z",
      updatedAt: "2026-07-15T05:00:00.000Z",
      teacher: { id: "teacher-zhao", name: "赵文清", status: "ACTIVE" },
    },
  ]
}

function createScoreRules(): ScoreRule[] {
  const base = {
    classId: MOCK_CLASS_ID,
    createdBy: MOCK_HEAD_TEACHER_ID,
    createdAt: "2026-08-01T02:00:00.000Z",
    updatedAt: "2026-08-20T02:00:00.000Z",
  }
  return [
    { ...base, id: "rule-answer", name: "精彩回答", delta: 2, description: "准确回答课堂问题并说明思路", enabled: true },
    { ...base, id: "rule-participate", name: "积极参与", delta: 1, description: "主动参与讨论或课堂活动", enabled: true },
    { ...base, id: "rule-help", name: "帮助同学", delta: 2, description: "耐心帮助同学理解知识点", enabled: true },
    { ...base, id: "rule-homework", name: "作业优秀", delta: 3, description: "作业完成认真且订正完整", enabled: true },
    { ...base, id: "rule-discipline", name: "课堂纪律", delta: -2, description: "影响课堂秩序，经提醒后仍未改正", enabled: true },
    { ...base, id: "rule-late", name: "迟到", delta: -1, description: "未按规定时间进入课堂", enabled: false },
  ]
}

function createSeatVersions(students: Student[]): SeatLayoutVersion[] {
  const active = students.filter((student) => student.status === "ACTIVE")
  const studentPositions = new Map([
    ["1-0", active[0]], ["1-1", active[1]], ["1-3", active[2]], ["1-4", active[3]],
    ["1-6", active[4]], ["1-7", active[5]], ["1-9", active[6]],
  ])
  const createSeats = (version: number): Seat[] => Array.from({ length: 7 * 11 }, (_, index) => {
    const row = Math.floor(index / 11)
    const col = index % 11
    const student = studentPositions.get(`${row}-${col}`)
    const cellType = row === 0 && col === 4
      ? "podium"
      : row === 0
        ? "empty"
        : [2, 5, 8].includes(col)
          ? "aisle"
          : "seat"
    return {
      id: `cell-v${version}-${row}-${col}`,
      row,
      col,
      cellType,
      student: cellType === "seat" && student ? { id: student.id, name: student.name } : null,
    }
  })
  return [
    {
      versionId: "layout-version-1",
      version: 1,
      rows: 7,
      cols: 11,
      seats: createSeats(1),
      classId: MOCK_CLASS_ID,
      sourceVersionId: null,
      createdBy: MOCK_HEAD_TEACHER_ID,
      createdAt: "2026-08-12T06:15:00.000Z",
    },
    {
      versionId: "layout-version-2",
      version: 2,
      rows: 7,
      cols: 11,
      seats: createSeats(2),
      classId: MOCK_CLASS_ID,
      sourceVersionId: null,
      createdBy: MOCK_HEAD_TEACHER_ID,
      createdAt: "2026-08-20T07:30:00.000Z",
    },
  ]
}

function createScoreRecords(): MockScoreRecord[] {
  const operators = ["teacher-wang", "teacher-chen", "teacher-li"] as const
  const subjects = ["数学", "英语", "物理"] as const
  const weeklyTotals = [12, 10, 9, 8, 8, 7, 7, 6, 6, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1]
  let recordIndex = 0
  const current = weeklyTotals.flatMap<MockScoreRecord>((total, studentIndex) => {
    const records: MockScoreRecord[] = []
    let remaining = total
    while (remaining > 0) {
      const delta = remaining >= 3 ? 3 : remaining
      const ruleId = delta === 3 ? "rule-homework" : delta === 2 ? "rule-answer" : "rule-participate"
      recordIndex += 1
      records.push({
        id: `score-current-${String(recordIndex).padStart(3, "0")}`,
        classId: MOCK_CLASS_ID,
        studentId: studentId(studentIndex),
        operatorId: operators[recordIndex % operators.length],
        subject: subjects[recordIndex % subjects.length],
        ruleId,
        delta,
        reason: null,
        recordType: "NORMAL",
        reverted: false,
        revertedRecordId: null,
        createdAt: `2026-08-${recordIndex % 2 === 0 ? "25" : "24"}T${String(8 + (recordIndex % 8)).padStart(2, "0")}:${String((recordIndex * 7) % 60).padStart(2, "0")}:00.000Z`,
      })
      remaining -= delta
    }
    return records
  })

  return [
    ...current,
    {
      id: "score-history-inactive",
      classId: MOCK_CLASS_ID,
      studentId: "student-history-zhou",
      operatorId: "teacher-wang",
      subject: "数学",
      ruleId: "rule-answer",
      delta: 2,
      reason: null,
      recordType: "NORMAL",
      reverted: false,
      revertedRecordId: null,
      createdAt: "2026-07-10T03:20:00.000Z",
    },
    {
      id: "score-reverted-original",
      classId: MOCK_CLASS_ID,
      studentId: studentId(5),
      operatorId: "teacher-chen",
      subject: "英语",
      ruleId: "rule-discipline",
      delta: -2,
      reason: null,
      recordType: "NORMAL",
      reverted: true,
      revertedRecordId: null,
      createdAt: "2026-08-24T03:15:00.000Z",
    },
    {
      id: "score-revert-history",
      classId: MOCK_CLASS_ID,
      studentId: studentId(5),
      operatorId: MOCK_HEAD_TEACHER_ID,
      subject: "语文",
      ruleId: "rule-discipline",
      delta: 2,
      reason: "撤销积分记录 score-reverted-original",
      recordType: "REVERT",
      reverted: false,
      revertedRecordId: "score-reverted-original",
      createdAt: "2026-08-24T03:22:00.000Z",
    },
  ]
}

function createDisplayDevices(): MockDisplayDevice[] {
  return [
    {
      id: "display-main-board",
      classId: MOCK_CLASS_ID,
      name: "高一（3）班智慧黑板",
      status: "ACTIVE",
      lastSeenAt: "2026-08-26T02:29:30.000Z",
      createdAt: "2026-08-18T03:00:00.000Z",
      revokedAt: null,
      online: true,
    },
    {
      id: "display-history-projector",
      classId: MOCK_CLASS_ID,
      name: "旧多媒体投影",
      status: "REVOKED",
      lastSeenAt: "2026-07-01T06:00:00.000Z",
      createdAt: "2026-03-01T03:00:00.000Z",
      revokedAt: "2026-07-02T01:00:00.000Z",
      online: false,
    },
  ]
}

function createScorePeriods(): ScorePeriod[] {
  return [{
    id: "period-2026-08",
    startAt: "2026-07-31T16:00:00.000Z",
    endAt: "2026-08-31T16:00:00.000Z",
    initialScore: 100,
    status: "OPEN",
    settledAt: null,
  }]
}

function createCommitteeAssignments(): MockDatabaseState["committeeAssignments"] {
  return [
    {
      id: "committee-1",
      studentId: studentId(0),
      studentName: "陈思远",
      role: "班长",
      subject: null,
      termStartAt: "2026-08-01T00:00:00.000Z",
      termEndAt: null,
      trialEndsAt: "2026-09-01T00:00:00.000Z",
      status: "ACTIVE",
    },
    {
      id: "committee-2",
      studentId: studentId(1),
      studentName: "林语桐",
      role: "学习委员",
      subject: null,
      termStartAt: "2026-08-01T00:00:00.000Z",
      termEndAt: null,
      trialEndsAt: "2026-09-01T00:00:00.000Z",
      status: "ACTIVE",
    },
  ]
}

const STANDARD_PERIODS = [
  ["08:00", "08:40"], ["08:50", "09:30"], ["09:50", "10:30"], ["10:40", "11:20"],
  ["14:00", "14:40"], ["14:50", "15:30"], ["15:50", "16:30"], ["16:40", "17:20"],
] as const

function createScheduleTemplates(): MockScheduleTemplate[] {
  return [
    {
      id: "schedule-template-standard",
      classId: MOCK_CLASS_ID,
      name: "标准作息",
      periods: STANDARD_PERIODS.map(([startTime, endTime], index) => ({ periodNo: index + 1, startTime, endTime })),
    },
    {
      id: "schedule-template-late",
      classId: MOCK_CLASS_ID,
      name: "晚起作息",
      periods: STANDARD_PERIODS.map(([startTime, endTime], index) => {
        const [hour, minute] = startTime.split(":").map(Number)
        const [endHour, endMinute] = endTime.split(":").map(Number)
        const shiftedStart = hour * 60 + minute + 30
        const shiftedEnd = endHour * 60 + endMinute + 30
        return {
          periodNo: index + 1,
          startTime: `${String(Math.floor(shiftedStart / 60)).padStart(2, "0")}:${String(shiftedStart % 60).padStart(2, "0")}`,
          endTime: `${String(Math.floor(shiftedEnd / 60)).padStart(2, "0")}:${String(shiftedEnd % 60).padStart(2, "0")}`,
        }
      }),
    },
  ]
}

function createScheduleEntries(): MockScheduleEntry[] {
  const courses = [
    ["语文", "relation-head-lin"], ["数学", "relation-wang-math"], ["英语", "relation-chen-english"],
    ["物理", "relation-li-physics"], ["化学", null], ["历史", null], ["生物", null], ["自习", null],
  ] as const
  return Array.from({ length: 5 * courses.length }, (_, index) => {
    const weekday = Math.floor(index / courses.length) + 1
    const periodNo = (index % courses.length) + 1
    const [courseName, classTeacherId] = courses[index % courses.length]
    return {
      id: `schedule-entry-${weekday}-${periodNo}`,
      classId: MOCK_CLASS_ID,
      weekday,
      periodNo,
      courseName,
      classTeacherId,
    }
  })
}

export function createMockDatabaseState(): MockDatabaseState {
  const students = createStudents()
  const classroom: Classroom = {
    id: MOCK_CLASS_ID,
    name: "海州市第一中学·高一（3）班",
    grade: "高一",
    schoolYear: "2026-2027",
    gridRows: 7,
    gridCols: 11,
    activeScheduleTemplateId: "schedule-template-standard",
    currentLayoutVersionId: "layout-version-2",
    role: "HEAD_TEACHER",
    subject: "语文",
    createdAt: "2026-02-01T01:00:00.000Z",
    updatedAt: "2026-08-20T07:30:00.000Z",
  }

  return {
    classrooms: [classroom],
    students,
    teachers: createTeachers(),
    scheduleTemplates: createScheduleTemplates(),
    scheduleEntries: createScheduleEntries(),
    scoreRules: createScoreRules(),
    scorePeriods: createScorePeriods(),
    scoreEvents: [],
    committeeAssignments: createCommitteeAssignments(),
    scoreRecords: createScoreRecords(),
    seatLayoutVersions: createSeatVersions(students),
    displayDevices: createDisplayDevices(),
    invitations: [
      {
        token: "mock-invite-chen-english",
        classTeacherId: "relation-chen-english",
        expiresAt: "2026-08-30T08:00:00.000Z",
        status: "PENDING",
      },
    ],
    bindingSessions: [],
    deviceCredentials: {
      "display-main-board": "mock-display-credential-main-board-2026",
    },
    previousWeekRanks: Object.fromEntries(
      students
        .filter((student) => student.status === "ACTIVE")
        .map((student, index) => [student.id, ((index + 8) % 30) + 1]),
    ),
    counters: {
      entity: 100,
      event: 100,
      randomPick: 0,
      clockTick: 0,
      bindingCode: 583921,
    },
  }
}
