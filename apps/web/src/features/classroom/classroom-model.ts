import { classroomRealtime } from "./classroom-realtime"
import type { ClassRealtimeEvent } from "./classroom-realtime"

export type { ClassRealtimeEvent } from "./classroom-realtime"

export type StudentStatus = "ACTIVE" | "INACTIVE"

export type ScoreRecordType = "NORMAL" | "REVERT"

export interface Student {
  id: string
  classId: string
  name: string
  studentNo: string
  status: StudentStatus
}

export interface ScoreRule {
  id: string
  name: string
  delta: number
  description: string
  enabled: boolean
}

export interface ScoreRecord {
  id: string
  student: Pick<Student, "id" | "name">
  operator: { id: string; name: string }
  subject: string
  rule: Pick<ScoreRule, "id" | "name"> | null
  delta: number
  reason: string | null
  recordType: ScoreRecordType
  reverted: boolean
  revertedRecordId: string | null
  createdAt: string
}

export interface Seat {
  id: string
  row: number
  col: number
  cellType?: "seat" | "aisle" | "podium" | "empty"
  student: Pick<Student, "id" | "name"> | null
}

export interface DisplayBootstrap {
  classroom: {
    id: string
    name: string
    gridRows: number
    gridCols: number
  }
  layout: {
    version: number | null
    seats: Seat[]
  }
  ranking: {
    top3: Array<{ studentId: string; name: string; rank: number }>
    progress: Array<{ studentId: string; name: string; change: number }>
  }
}

export interface BindingSession {
  code: string
  expiresAt: string
  bindingSessionId: string
  nonce: string
}

export type BindingPollResult =
  | { status: "PENDING" }
  | { status: "EXPIRED" }
  | { status: "READY"; deviceId: string; credential: string }

const CLASS_ID = "class-1"
const OPERATOR = { id: "teacher-1", name: "王老师" }
const SUBJECT = "数学"

const students: Student[] = [
  { id: "student-1", classId: CLASS_ID, name: "张三", studentNo: "01", status: "ACTIVE" },
  { id: "student-2", classId: CLASS_ID, name: "李四", studentNo: "02", status: "ACTIVE" },
  { id: "student-3", classId: CLASS_ID, name: "王五", studentNo: "03", status: "ACTIVE" },
  { id: "student-4", classId: CLASS_ID, name: "赵六", studentNo: "04", status: "ACTIVE" },
  { id: "student-5", classId: CLASS_ID, name: "陈明", studentNo: "05", status: "ACTIVE" },
  { id: "student-6", classId: CLASS_ID, name: "刘浩", studentNo: "06", status: "ACTIVE" },
  { id: "student-7", classId: CLASS_ID, name: "周九", studentNo: "07", status: "ACTIVE" },
  { id: "student-8", classId: CLASS_ID, name: "吴十", studentNo: "08", status: "ACTIVE" },
  { id: "student-9", classId: CLASS_ID, name: "林悦", studentNo: "09", status: "ACTIVE" },
  { id: "student-10", classId: CLASS_ID, name: "许安", studentNo: "10", status: "ACTIVE" },
]

const scoreRules: ScoreRule[] = [
  { id: "rule-1", name: "回答问题", delta: 2, description: "积极回答课堂问题", enabled: true },
  { id: "rule-2", name: "积极参与", delta: 1, description: "参与讨论与课堂活动", enabled: true },
  { id: "rule-3", name: "帮助同学", delta: 2, description: "主动帮助同学完成学习任务", enabled: true },
  { id: "rule-4", name: "课堂纪律", delta: -2, description: "课堂纪律提醒", enabled: true },
]

let recordSequence = 3
let bindingSequence = 0
let bindingSession: BindingSession & {
  status: "PENDING" | "READY"
  credentialClaimed: boolean
} | null = null

const scoreRecords: ScoreRecord[] = [
  {
    id: "record-1",
    student: { id: "student-1", name: "张三" },
    operator: OPERATOR,
    subject: SUBJECT,
    rule: { id: "rule-1", name: "回答问题" },
    delta: 2,
    reason: null,
    recordType: "NORMAL",
    reverted: false,
    revertedRecordId: null,
    createdAt: "2026-08-26T09:20:00.000Z",
  },
  {
    id: "record-2",
    student: { id: "student-4", name: "赵六" },
    operator: OPERATOR,
    subject: SUBJECT,
    rule: { id: "rule-4", name: "课堂纪律" },
    delta: -2,
    reason: null,
    recordType: "NORMAL",
    reverted: false,
    revertedRecordId: null,
    createdAt: "2026-08-26T09:12:00.000Z",
  },
  {
    id: "record-3",
    student: { id: "student-5", name: "陈明" },
    operator: { id: "teacher-2", name: "李老师" },
    subject: "英语",
    rule: { id: "rule-2", name: "积极参与" },
    delta: 1,
    reason: null,
    recordType: "NORMAL",
    reverted: false,
    revertedRecordId: null,
    createdAt: "2026-08-25T15:32:00.000Z",
  },
]

function copyRecords(): ScoreRecord[] {
  return scoreRecords.map((record) => ({
    ...record,
    student: { ...record.student },
    operator: { ...record.operator },
    rule: record.rule ? { ...record.rule } : null,
  }))
}

function emit<T extends ClassRealtimeEvent>(event: T): void {
  classroomRealtime.publish(event)
}

function newId(prefix: string): string {
  recordSequence += 1
  return `${prefix}-${recordSequence}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function findStudent(studentId: string): Student {
  const student = students.find((item) => item.id === studentId && item.status === "ACTIVE")
  if (!student) throw new Error("找不到在班学生")
  return student
}

function createRecord(input: {
  studentId: string
  delta: number
  rule: Pick<ScoreRule, "id" | "name"> | null
  reason: string | null
  recordType?: ScoreRecordType
  revertedRecordId?: string | null
}): ScoreRecord {
  const student = findStudent(input.studentId)
  const record: ScoreRecord = {
    id: newId("record"),
    student: { id: student.id, name: student.name },
    operator: OPERATOR,
    subject: SUBJECT,
    rule: input.rule,
    delta: input.delta,
    reason: input.reason,
    recordType: input.recordType ?? "NORMAL",
    reverted: false,
    revertedRecordId: input.revertedRecordId ?? null,
    createdAt: nowIso(),
  }
  scoreRecords.unshift(record)
  emit({
    id: newId("event"),
    type: "SCORE_CHANGED",
    classId: CLASS_ID,
    occurredAt: record.createdAt,
    payload: {
      studentId: student.id,
      direction: input.delta > 0 ? "INCREASE" : "DECREASE",
    },
  })
  emit({
    id: newId("event"),
    type: "RANKING_CHANGED",
    classId: CLASS_ID,
    occurredAt: record.createdAt,
    payload: { period: "WEEK" },
  })
  return { ...record, student: { ...record.student }, operator: { ...record.operator }, rule: record.rule ? { ...record.rule } : null }
}

export const classroomMock = {
  classId: CLASS_ID,
  teacher: OPERATOR,
  subject: SUBJECT,
  classroomName: "高一（3）班",

  getStudents(): Student[] {
    return students.filter((student) => student.status === "ACTIVE").map((student) => ({ ...student }))
  },

  getScoreRules(): ScoreRule[] {
    return scoreRules.filter((rule) => rule.enabled).map((rule) => ({ ...rule }))
  },

  getScoreRecords(): ScoreRecord[] {
    return copyRecords()
  },

  addRuleScore(studentId: string, ruleId: string): ScoreRecord {
    const rule = scoreRules.find((item) => item.id === ruleId && item.enabled)
    if (!rule) throw new Error("积分规则已停用")
    return createRecord({
      studentId,
      delta: rule.delta,
      rule: { id: rule.id, name: rule.name },
      reason: null,
    })
  },

  addCustomScore(studentId: string, delta: number, reason: string): ScoreRecord {
    const trimmedReason = reason.trim()
    if (!Number.isInteger(delta) || delta === 0) throw new Error("积分必须是非 0 整数")
    if (trimmedReason.length < 10) throw new Error("原因至少填写 10 个字符")
    return createRecord({ studentId, delta, rule: null, reason: trimmedReason })
  },

  revertScore(recordId: string): ScoreRecord {
    const record = scoreRecords.find((item) => item.id === recordId)
    if (!record) throw new Error("积分记录不存在")
    if (record.operator.id !== OPERATOR.id) throw new Error("只能撤销本人创建的记录")
    if (record.reverted || record.recordType === "REVERT") throw new Error("这条记录已经撤销")
    record.reverted = true
    const reverted = createRecord({
      studentId: record.student.id,
      delta: -record.delta,
      rule: record.rule,
      reason: `撤销：${record.reason ?? record.rule?.name ?? "积分操作"}`,
      recordType: "REVERT",
      revertedRecordId: record.id,
    })
    emit({
      id: newId("event"),
      type: "SCORE_REVERTED",
      classId: CLASS_ID,
      occurredAt: reverted.createdAt,
      payload: { studentId: record.student.id, recordId: record.id },
    })
    return reverted
  },

  pickRandomStudent(excludedStudentIds: string[]): Student {
    const excluded = new Set(excludedStudentIds)
    const available = students.filter((student) => student.status === "ACTIVE" && !excluded.has(student.id))
    if (available.length === 0) throw new Error("本轮已点完全部在班学生，请重置后再抽取")
    const selected = available[Math.floor(Math.random() * available.length)]
    emit({
      id: newId("event"),
      type: "RANDOM_PICKED",
      classId: CLASS_ID,
      occurredAt: nowIso(),
      payload: { studentId: selected.id, name: selected.name, displayDurationMs: 8000 },
    })
    return { ...selected }
  },

  getDisplayBootstrap(): DisplayBootstrap {
    const seats: Seat[] = students.slice(0, 8).map((student, index) => ({
      id: `seat-${index + 1}`,
      row: Math.floor(index / 4),
      col: index % 4,
      student: { id: student.id, name: student.name },
    }))
    return {
      classroom: { id: CLASS_ID, name: "高一（3）班", gridRows: 2, gridCols: 4 },
      layout: { version: 7, seats },
      ranking: {
        top3: [
          { studentId: "student-1", name: "张三", rank: 1 },
          { studentId: "student-5", name: "陈明", rank: 2 },
          { studentId: "student-2", name: "李四", rank: 3 },
        ],
        progress: [
          { studentId: "student-5", name: "陈明", change: 8 },
          { studentId: "student-6", name: "刘浩", change: 5 },
          { studentId: "student-4", name: "赵六", change: 3 },
        ],
      },
    }
  },

  createBindingSession(): BindingSession {
    bindingSequence += 1
    const code = String(583920 + bindingSequence).slice(-6)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    bindingSession = {
      code,
      expiresAt,
      bindingSessionId: `binding-session-${bindingSequence}`,
      nonce: `nonce-${bindingSequence}-${"classroom-device-nonce".repeat(3)}`,
      status: "PENDING",
      credentialClaimed: false,
    }
    return { ...bindingSession }
  },

  simulateBindingComplete(): void {
    if (!bindingSession || Date.parse(bindingSession.expiresAt) <= Date.now()) return
    bindingSession.status = "READY"
  },

  pollBindingSession(bindingSessionId: string, nonce: string): BindingPollResult {
    if (!bindingSession || bindingSession.bindingSessionId !== bindingSessionId || bindingSession.nonce !== nonce) {
      return { status: "EXPIRED" }
    }
    if (Date.parse(bindingSession.expiresAt) <= Date.now()) return { status: "EXPIRED" }
    if (bindingSession.status === "PENDING") return { status: "PENDING" }
    if (bindingSession.credentialClaimed) return { status: "READY", deviceId: "display-device-1", credential: "claimed" }
    bindingSession.credentialClaimed = true
    return { status: "READY", deviceId: "display-device-1", credential: `credential-${bindingSequence}-long-lived` }
  },
}
