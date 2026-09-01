import {
  ClassroomServiceError,
  type BindDisplayInput,
  type BindDisplayResult,
  type Classroom,
  type ClassroomService,
  type ClassroomSummary,
  type ClassTeacher,
  type ConsumeInvitationInput,
  type CreateBindingCodeResult,
  type CreateCustomScoreInput,
  type CreateRuleScoreInput,
  type CreateScoreRuleInput,
  type CreateStudentInput,
  type CreateTeacherInput,
  type CreateTeacherResult,
  type DeviceTokenInput,
  type DeviceTokenResult,
  type DisplayBootstrap,
  type DisplayDevice,
  type InvitationConsumeResult,
  type LoginInput,
  type LoginResult,
  type PaginatedEnvelope,
  type PollBindingSessionInput,
  type PollBindingSessionResult,
  type RandomPickInput,
  type RandomPickResult,
  type ClassSchedule,
  type RefreshInput,
  type SaveClassScheduleInput,
  type SaveSeatLayoutInput,
  type ScoreRecord,
  type ScoreRecordListQuery,
  type ScoreRule,
  type Seat,
  type SeatLayout,
  type SeatLayoutMutation,
  type SeatLayoutVersion,
  type SeatLayoutVersionSummary,
  type Student,
  type StudentListQuery,
  type TeacherInvitation,
  type TokenPair,
  type UpdateClassroomInput,
  type UpdateScoreRuleInput,
  type UpdateStudentInput,
  type UpdateTeacherInput,
  type WeeklyRanking,
  type Weekday,
} from "@/lib"
import {
  InMemoryRealtimeBus,
  type ClassEventType,
  type ClassRealtimeClient,
  type RealtimeEventPayloads,
} from "@/lib/realtime"

import {
  MOCK_CLASS_ID,
  MOCK_CURRENT_WEEK_END,
  MOCK_CURRENT_WEEK_START,
  MOCK_HEAD_TEACHER_ID,
} from "./data"
import { MockClassroomRepository } from "./repository"
import type { MockDatabaseState, MockScheduleEntry, MockScheduleTemplate, MockScoreRecord } from "./types"

const DEFAULT_PAGE_SIZE = 20

function requiredText(value: string, code: string, message: string): string {
  const normalized = value.trim()
  if (!normalized) throw new ClassroomServiceError(code, message, 400)
  return normalized
}

function assertNonZeroInteger(value: number): void {
  if (!Number.isInteger(value) || value === 0) {
    throw new ClassroomServiceError("VALIDATION_FAILED", "积分必须为非 0 整数", 400)
  }
}

function paginate<T>(items: T[], page = 1, pageSize = DEFAULT_PAGE_SIZE): PaginatedEnvelope<T> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))
  const start = (safePage - 1) * safePageSize
  return {
    data: items.slice(start, start + safePageSize),
    meta: { page: safePage, pageSize: safePageSize, total: items.length },
  }
}

function classroomSummary(classroom: Classroom): ClassroomSummary {
  const {
    id,
    name,
    grade,
    schoolYear,
    gridRows,
    gridCols,
    role,
    subject,
  } = classroom
  return { id, name, grade, schoolYear, gridRows, gridCols, role, subject }
}

export class MockClassroomService implements ClassroomService {
  constructor(
    private readonly repository: MockClassroomRepository,
    private readonly realtimeBus: InMemoryRealtimeBus,
  ) {}

  get realtime(): ClassRealtimeClient {
    return this.realtimeBus
  }

  async listClassrooms(): Promise<ClassroomSummary[]> {
    return this.repository.read((state) => state.classrooms.map(classroomSummary))
  }

  async getClassroom(classId: string): Promise<Classroom> {
    return this.repository.read((state) => this.requireClassroom(state, classId))
  }

  async updateClassroom(classId: string, input: UpdateClassroomInput): Promise<Classroom> {
    const identity = this.repository.issueIdentity("classroom-update")
    return this.repository.transact((state) => {
      const classroom = this.requireClassroom(state, classId)
      const rows = input.gridRows ?? classroom.gridRows
      const cols = input.gridCols ?? classroom.gridCols
      if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 20 || cols > 20) {
        throw new ClassroomServiceError("VALIDATION_FAILED", "教室网格必须在 1 到 20 行列之间", 400)
      }
      const current = state.seatLayoutVersions.find(
        (version) => version.versionId === classroom.currentLayoutVersionId,
      )
      if (current?.seats.some((seat) => seat.row >= rows || seat.col >= cols)) {
        throw new ClassroomServiceError(
          "CLASSROOM_GRID_HAS_OUT_OF_BOUNDS_SEATS",
          "当前座位布局包含调整后网格范围外的座位",
          409,
        )
      }
      if (input.name !== undefined) classroom.name = requiredText(input.name, "VALIDATION_FAILED", "班级名称不能为空")
      if (input.grade !== undefined) classroom.grade = requiredText(input.grade, "VALIDATION_FAILED", "年级不能为空")
      if (input.schoolYear !== undefined) classroom.schoolYear = requiredText(input.schoolYear, "VALIDATION_FAILED", "学年不能为空")
      classroom.gridRows = rows
      classroom.gridCols = cols
      classroom.updatedAt = identity.occurredAt
      return classroom
    })
  }

  async listStudents(
    classId: string,
    query: StudentListQuery = {},
  ): Promise<PaginatedEnvelope<Student>> {
    return this.repository.read((state) => {
      this.requireClassroom(state, classId)
      const keyword = query.keyword?.trim().toLocaleLowerCase("zh-CN")
      const filtered = state.students
        .filter((student) => student.classId === classId)
        .filter((student) => query.status === undefined || student.status === query.status)
        .filter(
          (student) =>
            keyword === undefined ||
            student.name.toLocaleLowerCase("zh-CN").includes(keyword) ||
            student.studentNo?.toLocaleLowerCase("zh-CN").includes(keyword),
        )
        .sort((left, right) => (left.studentNo ?? "").localeCompare(right.studentNo ?? "", "zh-CN"))
      return paginate(filtered, query.page, query.pageSize)
    })
  }

  async createStudent(classId: string, input: CreateStudentInput): Promise<Student> {
    const identity = this.repository.issueIdentity("student")
    const student = this.repository.transact((state) => {
      this.requireClassroom(state, classId)
      const name = requiredText(input.name, "VALIDATION_FAILED", "学生姓名不能为空")
      const studentNo = input.studentNo?.trim() || null
      this.assertStudentNoAvailable(state, classId, studentNo)
      const created: Student = {
        id: identity.id,
        classId,
        name,
        studentNo,
        status: "ACTIVE",
        createdAt: identity.occurredAt,
        updatedAt: identity.occurredAt,
      }
      state.students.push(created)
      return created
    })
    this.emit(classId, "STUDENT_CHANGED", { studentId: student.id, action: "CREATED" })
    return student
  }

  async updateStudent(
    classId: string,
    studentId: string,
    input: UpdateStudentInput,
  ): Promise<Student> {
    const identity = this.repository.issueIdentity("student-update")
    const student = this.repository.transact((state) => {
      const current = this.requireStudent(state, classId, studentId)
      if (input.name !== undefined) current.name = requiredText(input.name, "VALIDATION_FAILED", "学生姓名不能为空")
      if (input.studentNo !== undefined) {
        const studentNo = input.studentNo?.trim() || null
        this.assertStudentNoAvailable(state, classId, studentNo, studentId)
        current.studentNo = studentNo
      }
      current.updatedAt = identity.occurredAt
      return current
    })
    this.emit(classId, "STUDENT_CHANGED", { studentId, action: "UPDATED" })
    return student
  }

  async deactivateStudent(classId: string, studentId: string): Promise<Student> {
    const identity = this.repository.issueIdentity("student-deactivate")
    const result = this.repository.transact((state) => {
      const classroom = this.requireClassroom(state, classId)
      const student = this.requireStudent(state, classId, studentId)
      if (student.status === "INACTIVE") {
        throw new ClassroomServiceError("STUDENT_ALREADY_INACTIVE", "学生已经停用", 409)
      }
      student.status = "INACTIVE"
      student.updatedAt = identity.occurredAt
      const current = this.currentLayoutVersion(state, classroom)
      let layoutVersion: number | null = null
      if (current !== undefined) {
        const version = this.nextLayoutVersion(state, classId)
        const versionId = `${identity.id}-layout`
        state.seatLayoutVersions.push({
          ...current,
          versionId,
          version,
          sourceVersionId: null,
          createdAt: identity.occurredAt,
          seats: current.seats.map((seat) => ({
            ...seat,
            id: `${versionId}-${seat.row}-${seat.col}`,
            student: seat.student?.id === studentId ? null : seat.student,
          })),
        })
        classroom.currentLayoutVersionId = versionId
        classroom.updatedAt = identity.occurredAt
        layoutVersion = version
      }
      return { student, layoutVersion }
    })
    this.emit(classId, "STUDENT_CHANGED", { studentId, action: "DEACTIVATED" })
    if (result.layoutVersion !== null) {
      this.emit(classId, "SEAT_LAYOUT_CHANGED", { version: result.layoutVersion })
    }
    this.emit(classId, "RANKING_CHANGED", { period: "WEEK" })
    return result.student
  }

  async listTeachers(classId: string): Promise<ClassTeacher[]> {
    return this.repository.read((state) => {
      this.requireClassroom(state, classId)
      return state.teachers.filter((teacher) => teacher.classId === classId)
    })
  }

  async getSchedule(classId: string): Promise<ClassSchedule> {
    return this.repository.read((state) => {
      this.requireClassroom(state, classId)
      return {
        activeTemplateId: state.classrooms.find((item) => item.id === classId)!.activeScheduleTemplateId,
        templates: state.scheduleTemplates
          .filter((template) => template.classId === classId)
          .map(({ id, name, periods }) => ({ id, name, periods: periods.map((period) => ({ ...period })) })),
        entries: state.scheduleEntries
          .filter((entry) => entry.classId === classId)
          .sort((left, right) => left.weekday - right.weekday || left.periodNo - right.periodNo)
          .map((entry) => {
            const relation = state.teachers.find((teacher) => teacher.id === entry.classTeacherId)
            return {
              weekday: entry.weekday as ClassSchedule["entries"][number]["weekday"],
              periodNo: entry.periodNo,
              courseName: entry.courseName,
              classTeacherId: entry.classTeacherId,
              teacher: relation ? { id: relation.teacher.id, name: relation.teacher.name } : null,
            }
          }),
      }
    })
  }

  async saveSchedule(classId: string, input: SaveClassScheduleInput): Promise<ClassSchedule> {
    const identity = this.repository.issueIdentity("schedule")
    this.repository.transact((state) => {
      const classroom = this.requireClassroom(state, classId)
      if (input.templates.length === 0 || input.templates.length > 12) {
        throw new ClassroomServiceError("SCHEDULE_TEMPLATE_REQUIRED", "至少保留一套作息模板", 400)
      }
      const keys = new Set<string>()
      const names = new Set<string>()
      const periodKeys = new Set(input.templates[0].periods.map((period) => period.periodNo))
      for (const template of input.templates) {
        const key = template.clientKey.trim()
        const name = template.name.trim()
        if (!key || keys.has(key)) throw new ClassroomServiceError("SCHEDULE_TEMPLATE_KEY_INVALID", "作息模板标识无效", 400)
        if (!name || names.has(name)) throw new ClassroomServiceError("SCHEDULE_TEMPLATE_NAME_INVALID", "作息模板名称重复或为空", 400)
        keys.add(key)
        names.add(name)
        const sorted = [...template.periods].sort((left, right) => left.periodNo - right.periodNo)
        if (sorted.length === 0 || sorted.length > 12 || sorted.some((period, index) => period.periodNo !== index + 1)) {
          throw new ClassroomServiceError("SCHEDULE_PERIOD_SET_INVALID", "作息节次无效", 400)
        }
        for (let index = 0; index < sorted.length; index += 1) {
          const period = sorted[index]
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(period.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(period.endTime)) {
            throw new ClassroomServiceError("SCHEDULE_TIME_INVALID", "上下课时间格式无效", 400)
          }
          if (period.startTime >= period.endTime || (index > 0 && sorted[index - 1].endTime > period.startTime)) {
            throw new ClassroomServiceError("SCHEDULE_TIME_RANGE_INVALID", "作息时间无效", 400)
          }
        }
        if (sorted.length !== periodKeys.size || sorted.some((period) => !periodKeys.has(period.periodNo))) {
          throw new ClassroomServiceError("SCHEDULE_PERIOD_SET_MISMATCH", "所有作息模板必须使用相同节次", 400)
        }
      }
      const existingIds = new Set(state.scheduleTemplates.filter((template) => template.classId === classId).map((template) => template.id))
      const incomingIds = new Set(input.templates.flatMap((template) => template.id ? [template.id] : []))
      if ([...incomingIds].some((id) => !existingIds.has(id))) throw new ClassroomServiceError("SCHEDULE_TEMPLATE_NOT_FOUND", "作息模板不存在", 404)
      state.scheduleTemplates = state.scheduleTemplates.filter((template) => template.classId !== classId || incomingIds.has(template.id))
      const templateIdByKey = new Map<string, string>()
      for (const template of input.templates) {
        const id = template.id ?? `${identity.id}-${template.clientKey}`
        const saved: MockScheduleTemplate = { id, classId, name: template.name.trim(), periods: template.periods.map((period) => ({ ...period })) }
        const index = state.scheduleTemplates.findIndex((item) => item.id === id)
        if (index >= 0) state.scheduleTemplates[index] = saved
        else state.scheduleTemplates.push(saved)
        templateIdByKey.set(template.clientKey.trim(), id)
      }
      const activeTemplateId = templateIdByKey.get(input.activeTemplateKey.trim())
      if (!activeTemplateId) throw new ClassroomServiceError("SCHEDULE_ACTIVE_TEMPLATE_REQUIRED", "当前作息模板不存在", 400)
      const allowedPeriodNos = new Set(input.templates[0].periods.map((period) => period.periodNo))
      const entryKeys = new Set<string>()
      const activeTeacherIds = new Set(state.teachers.filter((teacher) => teacher.classId === classId && teacher.status === "ACTIVE").map((teacher) => teacher.id))
      const nextEntries: MockScheduleEntry[] = []
      for (const entry of input.entries) {
        const courseName = entry.courseName.trim()
        const key = `${entry.weekday}-${entry.periodNo}`
        if (entry.weekday < 1 || entry.weekday > 7 || !allowedPeriodNos.has(entry.periodNo) || !courseName || entryKeys.has(key)) {
          throw new ClassroomServiceError("SCHEDULE_ENTRY_INVALID", "课表课程格子无效", 400)
        }
        if (entry.classTeacherId && !activeTeacherIds.has(entry.classTeacherId)) throw new ClassroomServiceError("SCHEDULE_TEACHER_NOT_FOUND", "任课教师不存在或已停用", 400)
        entryKeys.add(key)
        nextEntries.push({ id: `${identity.id}-${key}`, classId, weekday: entry.weekday, periodNo: entry.periodNo, courseName, classTeacherId: entry.classTeacherId ?? null })
      }
      state.scheduleEntries = state.scheduleEntries.filter((entry) => entry.classId !== classId)
      state.scheduleEntries.push(...nextEntries)
      classroom.activeScheduleTemplateId = activeTemplateId
      classroom.updatedAt = identity.occurredAt
    })
    const activeTemplateId = this.repository.read((state) => state.classrooms.find((item) => item.id === classId)!.activeScheduleTemplateId)
    this.emit(classId, "SCHEDULE_CHANGED", { activeTemplateId: activeTemplateId! })
    return this.getSchedule(classId)
  }

  async createTeacher(classId: string, input: CreateTeacherInput): Promise<CreateTeacherResult> {
    const identity = this.repository.issueIdentity("teacher")
    return this.repository.transact((state) => {
      this.requireClassroom(state, classId)
      const teacherId = identity.id
      const relationId = `${identity.id}-relation`
      const relation: ClassTeacher = {
        id: relationId,
        classId,
        teacherId,
        role: "SUBJECT_TEACHER",
        subject: requiredText(input.subject, "VALIDATION_FAILED", "任教学科不能为空"),
        status: "ACTIVE",
        createdAt: identity.occurredAt,
        updatedAt: identity.occurredAt,
        teacher: {
          id: teacherId,
          name: requiredText(input.name, "VALIDATION_FAILED", "教师姓名不能为空"),
          status: "ACTIVE",
        },
      }
      state.teachers.push(relation)
      return { classTeacherId: relationId, teacherId }
    })
  }

  async updateTeacher(
    classId: string,
    classTeacherId: string,
    input: UpdateTeacherInput,
  ): Promise<ClassTeacher> {
    const identity = this.repository.issueIdentity("teacher-update")
    return this.repository.transact((state) => {
      const relation = this.requireTeacherRelation(state, classId, classTeacherId)
      if (relation.role !== "SUBJECT_TEACHER" || relation.status !== "ACTIVE") {
        throw new ClassroomServiceError("TEACHER_RELATION_REVOKED", "任课教师关系已失效", 409)
      }
      if (input.name !== undefined) relation.teacher.name = requiredText(input.name, "VALIDATION_FAILED", "教师姓名不能为空")
      if (input.subject !== undefined) relation.subject = requiredText(input.subject, "VALIDATION_FAILED", "任教学科不能为空")
      relation.updatedAt = identity.occurredAt
      return relation
    })
  }

  async createTeacherInvitation(
    classId: string,
    classTeacherId: string,
  ): Promise<TeacherInvitation> {
    const identity = this.repository.issueIdentity("invitation")
    return this.repository.transact((state) => {
      const relation = this.requireTeacherRelation(state, classId, classTeacherId)
      if (relation.status !== "ACTIVE" || relation.role !== "SUBJECT_TEACHER") {
        throw new ClassroomServiceError("TEACHER_RELATION_REVOKED", "任课教师关系已失效", 409)
      }
      for (const invitation of state.invitations) {
        if (invitation.classTeacherId === classTeacherId && invitation.status === "PENDING") {
          invitation.status = "REVOKED"
        }
      }
      const token = `${identity.id}-token`
      const expiresAt = new Date(Date.parse(identity.occurredAt) + 7 * 24 * 60 * 60 * 1000).toISOString()
      state.invitations.push({ token, classTeacherId, expiresAt, status: "PENDING" })
      return { inviteUrl: `/invite/${encodeURIComponent(token)}`, expiresAt }
    })
  }

  async revokeTeacher(classId: string, classTeacherId: string): Promise<{ revoked: true }> {
    const identity = this.repository.issueIdentity("teacher-revoke")
    const result = this.repository.transact((state) => {
      const relation = this.requireTeacherRelation(state, classId, classTeacherId)
      if (relation.role !== "SUBJECT_TEACHER" || relation.status !== "ACTIVE") {
        throw new ClassroomServiceError("TEACHER_RELATION_REVOKED", "任课教师关系已撤销", 409)
      }
      relation.status = "REVOKED"
      relation.updatedAt = identity.occurredAt
      for (const invitation of state.invitations) {
        if (invitation.classTeacherId === classTeacherId && invitation.status === "PENDING") {
          invitation.status = "REVOKED"
        }
      }
      return { revoked: true as const }
    })
    return result
  }

  async listScoreRules(classId: string, enabled?: boolean): Promise<ScoreRule[]> {
    return this.repository.read((state) => {
      this.requireClassroom(state, classId)
      return state.scoreRules.filter(
        (rule) => rule.classId === classId && (enabled === undefined || rule.enabled === enabled),
      )
    })
  }

  async createScoreRule(classId: string, input: CreateScoreRuleInput): Promise<ScoreRule> {
    assertNonZeroInteger(input.delta)
    const identity = this.repository.issueIdentity("rule")
    return this.repository.transact((state) => {
      this.requireClassroom(state, classId)
      const rule: ScoreRule = {
        id: identity.id,
        classId,
        name: requiredText(input.name, "VALIDATION_FAILED", "积分规则名称不能为空"),
        delta: input.delta,
        description: input.description?.trim() || null,
        enabled: true,
        createdBy: MOCK_HEAD_TEACHER_ID,
        createdAt: identity.occurredAt,
        updatedAt: identity.occurredAt,
      }
      state.scoreRules.push(rule)
      return rule
    })
  }

  async updateScoreRule(
    classId: string,
    ruleId: string,
    input: UpdateScoreRuleInput,
  ): Promise<ScoreRule> {
    if (input.delta !== undefined) assertNonZeroInteger(input.delta)
    const identity = this.repository.issueIdentity("rule-update")
    return this.repository.transact((state) => {
      const rule = this.requireScoreRule(state, classId, ruleId)
      if (input.name !== undefined) rule.name = requiredText(input.name, "VALIDATION_FAILED", "积分规则名称不能为空")
      if (input.delta !== undefined) rule.delta = input.delta
      if (input.description !== undefined) rule.description = input.description?.trim() || null
      if (input.enabled !== undefined) rule.enabled = input.enabled
      rule.updatedAt = identity.occurredAt
      return rule
    })
  }

  async disableScoreRule(classId: string, ruleId: string): Promise<ScoreRule> {
    return this.updateScoreRule(classId, ruleId, { enabled: false })
  }

  async listScoreRecords(
    classId: string,
    query: ScoreRecordListQuery = {},
  ): Promise<PaginatedEnvelope<ScoreRecord>> {
    return this.repository.read((state) => {
      this.requireClassroom(state, classId)
      const filtered = state.scoreRecords
        .filter((record) => record.classId === classId)
        .filter((record) => query.studentId === undefined || record.studentId === query.studentId)
        .filter((record) => query.operatorId === undefined || record.operatorId === query.operatorId)
        .filter((record) => query.from === undefined || record.createdAt >= query.from)
        .filter((record) => query.to === undefined || record.createdAt <= query.to)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((record) => this.toScoreRecord(state, record))
      return paginate(filtered, query.page, query.pageSize)
    })
  }

  async createRuleScore(classId: string, input: CreateRuleScoreInput): Promise<ScoreRecord> {
    const identity = this.repository.issueIdentity("score")
    const record = this.repository.transact((state) => {
      const student = this.requireActiveStudent(state, classId, input.studentId)
      const rule = this.requireScoreRule(state, classId, input.ruleId)
      if (!rule.enabled) throw new ClassroomServiceError("SCORE_RULE_DISABLED", "积分规则已停用", 409)
      const operator = this.requireOperator(state, classId, input.operatorId)
      const created: MockScoreRecord = {
        id: identity.id,
        classId,
        studentId: student.id,
        operatorId: operator.teacherId,
        subject: operator.subject,
        ruleId: rule.id,
        delta: rule.delta,
        reason: null,
        recordType: "NORMAL",
        reverted: false,
        revertedRecordId: null,
        createdAt: identity.occurredAt,
      }
      state.scoreRecords.push(created)
      return this.toScoreRecord(state, created)
    })
    this.emitScoreEvents(classId, input.studentId, record.delta)
    return record
  }

  async createCustomScore(classId: string, input: CreateCustomScoreInput): Promise<ScoreRecord> {
    assertNonZeroInteger(input.delta)
    const reason = input.reason.trim()
    if (reason.length < 10) {
      throw new ClassroomServiceError("VALIDATION_FAILED", "自定义积分原因至少需要 10 个字符", 400)
    }
    const identity = this.repository.issueIdentity("score")
    const record = this.repository.transact((state) => {
      const student = this.requireActiveStudent(state, classId, input.studentId)
      const operator = this.requireOperator(state, classId, input.operatorId)
      const created: MockScoreRecord = {
        id: identity.id,
        classId,
        studentId: student.id,
        operatorId: operator.teacherId,
        subject: operator.subject,
        ruleId: null,
        delta: input.delta,
        reason,
        recordType: "NORMAL",
        reverted: false,
        revertedRecordId: null,
        createdAt: identity.occurredAt,
      }
      state.scoreRecords.push(created)
      return this.toScoreRecord(state, created)
    })
    this.emitScoreEvents(classId, input.studentId, record.delta)
    return record
  }

  async revertScore(classId: string, recordId: string, operatorId = MOCK_HEAD_TEACHER_ID): Promise<ScoreRecord> {
    const identity = this.repository.issueIdentity("score-revert")
    const result = this.repository.transact((state) => {
      const original = state.scoreRecords.find(
        (record) => record.id === recordId && record.classId === classId,
      )
      if (original === undefined || original.recordType !== "NORMAL") {
        throw new ClassroomServiceError("SCORE_RECORD_NOT_FOUND", "积分记录不存在", 404)
      }
      if (original.reverted) {
        throw new ClassroomServiceError("SCORE_RECORD_ALREADY_REVERTED", "积分记录已经撤销", 409)
      }
      const operator = this.requireOperator(state, classId, operatorId)
      if (operator.role !== "HEAD_TEACHER" && original.operatorId !== operator.teacherId) {
        throw new ClassroomServiceError("FORBIDDEN_SCORE_REVERT", "只能撤销自己创建的积分记录", 403)
      }
      original.reverted = true
      const reverted: MockScoreRecord = {
        id: identity.id,
        classId,
        studentId: original.studentId,
        operatorId: operator.teacherId,
        subject: operator.subject,
        ruleId: original.ruleId,
        delta: -original.delta,
        reason: `撤销积分记录 ${original.id}`,
        recordType: "REVERT",
        reverted: false,
        revertedRecordId: original.id,
        createdAt: identity.occurredAt,
      }
      state.scoreRecords.push(reverted)
      return { record: this.toScoreRecord(state, reverted), studentId: original.studentId }
    })
    this.emit(classId, "SCORE_REVERTED", { studentId: result.studentId, recordId })
    this.emit(classId, "RANKING_CHANGED", { period: "WEEK" })
    return result.record
  }

  async getSeatLayout(classId: string): Promise<SeatLayout> {
    return this.repository.read((state) => {
      const classroom = this.requireClassroom(state, classId)
      const current = this.currentLayoutVersion(state, classroom)
      return current === undefined
        ? { versionId: null, version: null, rows: classroom.gridRows, cols: classroom.gridCols, seats: [] }
        : {
            versionId: current.versionId,
            version: current.version,
            rows: classroom.gridRows,
            cols: classroom.gridCols,
            seats: current.seats,
          }
    })
  }

  async listSeatLayoutVersions(
    classId: string,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<PaginatedEnvelope<SeatLayoutVersionSummary>> {
    return this.repository.read((state) => {
      this.requireClassroom(state, classId)
      const versions = state.seatLayoutVersions
        .filter((version) => version.classId === classId)
        .sort((left, right) => right.version - left.version)
        .map(({ versionId, version, sourceVersionId, createdBy, createdAt }) => ({
          versionId: versionId ?? "",
          version: version ?? 0,
          sourceVersionId,
          createdBy,
          createdAt,
        }))
      return paginate(versions, page, pageSize)
    })
  }

  async getSeatLayoutVersion(classId: string, versionId: string): Promise<SeatLayout> {
    return this.repository.read((state) => {
      const version = this.requireLayoutVersion(state, classId, versionId)
      return {
        versionId: version.versionId,
        version: version.version,
        rows: version.rows,
        cols: version.cols,
        seats: version.seats,
      }
    })
  }

  async saveSeatLayout(classId: string, input: SaveSeatLayoutInput): Promise<SeatLayoutMutation> {
    const identity = this.repository.issueIdentity("layout")
    const result = this.repository.transact((state) => {
      const classroom = this.requireClassroom(state, classId)
      const current = this.currentLayoutVersion(state, classroom)
      if (input.baseVersion !== undefined && input.baseVersion !== (current?.version ?? 0)) {
        throw new ClassroomServiceError("SEAT_LAYOUT_VERSION_CONFLICT", "座位布局已发生变化，请重新加载", 409)
      }
      this.validateSeatDrafts(state, classroom, input.seats)
      const version = this.nextLayoutVersion(state, classId)
      const layout: SeatLayoutVersion = {
        versionId: identity.id,
        version,
        rows: classroom.gridRows,
        cols: classroom.gridCols,
        classId,
        sourceVersionId: null,
        createdBy: MOCK_HEAD_TEACHER_ID,
        createdAt: identity.occurredAt,
        seats: input.seats.map<Seat>((seat) => ({
          id: `${identity.id}-${seat.row}-${seat.col}`,
          row: seat.row,
          col: seat.col,
          cellType: seat.cellType ?? "seat",
          student:
            (seat.cellType ?? "seat") !== "seat" || seat.studentId === null
              ? null
              : (() => {
                  const student = this.requireActiveStudent(state, classId, seat.studentId)
                  return { id: student.id, name: student.name }
                })(),
        })),
      }
      state.seatLayoutVersions.push(layout)
      classroom.currentLayoutVersionId = identity.id
      classroom.updatedAt = identity.occurredAt
      return { versionId: identity.id, version }
    })
    this.emit(classId, "SEAT_LAYOUT_CHANGED", { version: result.version })
    return result
  }

  async restoreSeatLayout(classId: string, versionId: string): Promise<SeatLayoutMutation> {
    const identity = this.repository.issueIdentity("layout-restore")
    const result = this.repository.transact((state) => {
      const classroom = this.requireClassroom(state, classId)
      const source = this.requireLayoutVersion(state, classId, versionId)
      const version = this.nextLayoutVersion(state, classId)
      const restored: SeatLayoutVersion = {
        ...source,
        versionId: identity.id,
        version,
        sourceVersionId: versionId,
        createdBy: MOCK_HEAD_TEACHER_ID,
        createdAt: identity.occurredAt,
        seats: source.seats.map((seat) => {
          const student = seat.student === null
            ? null
            : state.students.find(
                (candidate) => candidate.id === seat.student?.id && candidate.status === "ACTIVE",
              )
          return {
            ...seat,
            id: `${identity.id}-${seat.row}-${seat.col}`,
            student: student === undefined || student === null ? null : { id: student.id, name: student.name },
          }
        }),
      }
      state.seatLayoutVersions.push(restored)
      classroom.currentLayoutVersionId = identity.id
      classroom.updatedAt = identity.occurredAt
      return { versionId: identity.id, version, sourceVersionId: versionId }
    })
    this.emit(classId, "SEAT_LAYOUT_CHANGED", { version: result.version })
    return result
  }

  async getWeeklyRanking(classId: string): Promise<WeeklyRanking> {
    return this.repository.read((state) => this.buildWeeklyRanking(state, classId))
  }

  async randomPick(classId: string, input: RandomPickInput = {}): Promise<RandomPickResult> {
    const result = this.repository.transact((state) => {
      if ((input.excludeStudentIds?.length ?? 0) > 200) {
        throw new ClassroomServiceError("VALIDATION_FAILED", "本轮排除学生不能超过 200 人", 400)
      }
      const excluded = new Set(input.excludeStudentIds ?? [])
      const candidates = state.students.filter(
        (student) => student.classId === classId && student.status === "ACTIVE" && !excluded.has(student.id),
      )
      if (candidates.length === 0) {
        throw new ClassroomServiceError("RANDOM_PICK_NO_CANDIDATES", "没有可点名的学生", 409)
      }
      const index = state.counters.randomPick % candidates.length
      state.counters.randomPick += 1
      const picked = candidates[index]
      return { student: { id: picked.id, name: picked.name } }
    })
    this.emit(classId, "RANDOM_PICKED", {
      studentId: result.student.id,
      name: result.student.name,
      displayDurationMs: 8000,
    })
    return result
  }

  async createBindingCode(): Promise<CreateBindingCodeResult> {
    const identity = this.repository.issueIdentity("binding-session")
    return this.repository.transact((state) => {
      state.counters.bindingCode = (state.counters.bindingCode + 137) % 1_000_000
      const code = String(state.counters.bindingCode).padStart(6, "0")
      const nonce = `${identity.id}-nonce-0123456789abcdefghijklmnopqrstuvwxyz`
      const expiresAt = new Date(Date.parse(identity.occurredAt) + 5 * 60 * 1000).toISOString()
      state.bindingSessions.push({
        id: identity.id,
        code,
        nonce,
        expiresAt,
        status: "PENDING",
        deviceId: null,
        credential: null,
      })
      return { code, expiresAt, bindingSessionId: identity.id, nonce }
    })
  }

  async pollBindingSession(
    bindingSessionId: string,
    input: PollBindingSessionInput,
  ): Promise<PollBindingSessionResult> {
    return this.repository.transact((state) => {
      const session = state.bindingSessions.find((candidate) => candidate.id === bindingSessionId)
      if (session === undefined) {
        throw new ClassroomServiceError("BINDING_SESSION_NOT_FOUND", "绑定会话不存在或已过期", 404)
      }
      if (session.nonce !== input.nonce) {
        throw new ClassroomServiceError("BINDING_SESSION_FORBIDDEN", "绑定会话校验失败", 403)
      }
      if (session.status === "CLAIMED") {
        throw new ClassroomServiceError("BINDING_CREDENTIAL_ALREADY_CLAIMED", "设备凭证已被领取", 410)
      }
      if (session.status === "PENDING") return { status: "PENDING" as const }
      if (session.deviceId === null || session.credential === null) {
        throw new ClassroomServiceError("BINDING_SESSION_INVALID", "绑定会话数据不完整", 410)
      }
      session.status = "CLAIMED"
      return {
        status: "READY" as const,
        deviceId: session.deviceId,
        credential: session.credential,
      }
    })
  }

  async listDisplayDevices(classId: string): Promise<DisplayDevice[]> {
    return this.repository.read((state) => {
      this.requireClassroom(state, classId)
      return state.displayDevices
        .filter((device) => device.classId === classId)
        .map<DisplayDevice>((device) => ({
          id: device.id,
          name: device.name,
          status: device.status,
          lastSeenAt: device.lastSeenAt,
          createdAt: device.createdAt,
          revokedAt: device.revokedAt,
          online: device.online,
        }))
    })
  }

  async bindDisplayDevice(classId: string, input: BindDisplayInput): Promise<BindDisplayResult> {
    const identity = this.repository.issueIdentity("display")
    const result = this.repository.transact((state) => {
      this.requireClassroom(state, classId)
      const activeCount = state.displayDevices.filter(
        (device) => device.classId === classId && device.status === "ACTIVE",
      ).length
      if (activeCount >= 2) {
        throw new ClassroomServiceError("DISPLAY_DEVICE_LIMIT_REACHED", "每个班级最多绑定两个有效大屏设备", 409)
      }
      const session = state.bindingSessions.find(
        (candidate) => candidate.code === input.code && candidate.status === "PENDING",
      )
      if (session === undefined) {
        throw new ClassroomServiceError("BINDING_CODE_INVALID", "绑定码无效、已过期或已被使用", 410)
      }
      if (session.expiresAt <= identity.occurredAt) {
        throw new ClassroomServiceError("BINDING_CODE_EXPIRED", "绑定码已经过期", 410)
      }
      const credential = `${identity.id}-credential-0123456789abcdefghijklmnopqrstuvwxyz`
      state.displayDevices.push({
        id: identity.id,
        classId,
        name: requiredText(input.name, "VALIDATION_FAILED", "设备名称不能为空"),
        status: "ACTIVE",
        lastSeenAt: identity.occurredAt,
        createdAt: identity.occurredAt,
        revokedAt: null,
        online: true,
      })
      state.deviceCredentials[identity.id] = credential
      session.status = "READY"
      session.deviceId = identity.id
      session.credential = credential
      return { deviceId: identity.id }
    })
    this.emit(classId, "DISPLAY_CONFIG_CHANGED", { mode: "SEAT_AND_RANKING" })
    return result
  }

  async revokeDisplayDevice(classId: string, deviceId: string): Promise<BindDisplayResult> {
    const identity = this.repository.issueIdentity("display-revoke")
    const result = this.repository.transact((state) => {
      const device = state.displayDevices.find(
        (candidate) => candidate.id === deviceId && candidate.classId === classId && candidate.status === "ACTIVE",
      )
      if (device === undefined) {
        throw new ClassroomServiceError("DISPLAY_DEVICE_NOT_FOUND", "大屏设备不存在或已吊销", 404)
      }
      device.status = "REVOKED"
      device.revokedAt = identity.occurredAt
      device.online = false
      delete state.deviceCredentials[deviceId]
      return { deviceId }
    })
    this.emit(classId, "DISPLAY_CONFIG_CHANGED", { mode: "SEAT_AND_RANKING" })
    return result
  }

  async exchangeDeviceCredential(input: DeviceTokenInput): Promise<DeviceTokenResult> {
    return this.repository.read((state) => {
      const device = state.displayDevices.find(
        (candidate) => candidate.id === input.deviceId && candidate.status === "ACTIVE",
      )
      if (device === undefined || state.deviceCredentials[input.deviceId] !== input.credential) {
        throw new ClassroomServiceError("INVALID_DEVICE_CREDENTIAL", "设备不存在、已吊销或凭证错误", 401)
      }
      return { accessToken: `mock-display-access-${input.deviceId}`, expiresIn: 1800 }
    })
  }

  async getDisplayBootstrap(deviceId: string): Promise<DisplayBootstrap> {
    return this.repository.read((state) => {
      const device = state.displayDevices.find(
        (candidate) => candidate.id === deviceId && candidate.status === "ACTIVE",
      )
      if (device === undefined) {
        throw new ClassroomServiceError("DISPLAY_DEVICE_REVOKED", "设备未绑定或已吊销", 401)
      }
      const classroom = this.requireClassroom(state, device.classId)
      const layout = this.currentLayoutVersion(state, classroom)
      const ranking = this.buildWeeklyRanking(state, device.classId)
      const activeTemplate = state.scheduleTemplates.find(
        (template) => template.id === classroom.activeScheduleTemplateId,
      )
      return {
        classroom: {
          id: classroom.id,
          name: classroom.name,
          gridRows: classroom.gridRows,
          gridCols: classroom.gridCols,
        },
        layout: {
          version: layout?.version ?? null,
          seats: layout?.seats.map(({ row, col, student }) => ({ row, col, student })) ?? [],
        },
        ranking: {
          top3: ranking.top3,
          progress: ranking.progress.map(({ studentId, name, change }) => ({ studentId, name, change })),
        },
        schedule: {
          periods: activeTemplate?.periods ?? [],
          entries: state.scheduleEntries
            .filter((entry) => entry.classId === device.classId)
            .map(({ weekday, periodNo, courseName }) => ({ weekday: weekday as Weekday, periodNo, courseName })),
        },
      }
    })
  }

  async login(input: LoginInput): Promise<LoginResult> {
    if (input.account !== "lin.laoshi" || input.password !== "classroom123") {
      throw new ClassroomServiceError("INVALID_CREDENTIALS", "账号或密码错误", 401)
    }
    return {
      accessToken: "mock-user-access-lin",
      refreshToken: "mock-user-refresh-lin",
      user: { id: MOCK_HEAD_TEACHER_ID, name: "林雅雯" },
    }
  }

  async refresh(input: RefreshInput): Promise<TokenPair> {
    if (!input.refreshToken.startsWith("mock-user-refresh-")) {
      throw new ClassroomServiceError("INVALID_REFRESH_TOKEN", "Refresh Token 无效或已过期", 401)
    }
    const identity = this.repository.issueIdentity("auth-refresh")
    return {
      accessToken: `mock-user-access-${identity.id}`,
      refreshToken: `mock-user-refresh-${identity.id}`,
    }
  }

  async consumeInvitation(
    token: string,
    input: ConsumeInvitationInput,
  ): Promise<InvitationConsumeResult> {
    requiredText(input.deviceName, "VALIDATION_FAILED", "设备名称不能为空")
    const identity = this.repository.issueIdentity("invitation-consume")
    return this.repository.transact((state) => {
      const invitation = state.invitations.find((candidate) => candidate.token === token)
      if (invitation === undefined) {
        throw new ClassroomServiceError("INVITATION_NOT_FOUND", "邀请不存在", 404)
      }
      if (invitation.status === "USED") {
        throw new ClassroomServiceError("INVITATION_ALREADY_USED", "邀请已经使用", 409)
      }
      if (invitation.status !== "PENDING") {
        throw new ClassroomServiceError("INVITATION_REVOKED", "邀请已经失效", 410)
      }
      if (invitation.expiresAt <= identity.occurredAt) {
        invitation.status = "EXPIRED"
        throw new ClassroomServiceError("INVITATION_EXPIRED", "邀请已经过期", 410)
      }
      const relation = state.teachers.find((teacher) => teacher.id === invitation.classTeacherId)
      if (relation === undefined || relation.status !== "ACTIVE") {
        throw new ClassroomServiceError("INVITATION_REVOKED", "教师关系已经失效", 410)
      }
      const classroom = this.requireClassroom(state, relation.classId)
      invitation.status = "USED"
      return {
        accessToken: `mock-user-access-${identity.id}`,
        refreshToken: `mock-user-refresh-${identity.id}`,
        classroom: { id: classroom.id, name: classroom.name },
        teacher: {
          id: relation.teacher.id,
          name: relation.teacher.name,
          subject: relation.subject,
        },
      }
    })
  }

  private requireClassroom(state: Readonly<MockDatabaseState>, classId: string): Classroom {
    const classroom = state.classrooms.find((candidate) => candidate.id === classId)
    if (classroom === undefined) throw new ClassroomServiceError("CLASSROOM_NOT_FOUND", "班级不存在", 404)
    return classroom
  }

  private requireStudent(state: MockDatabaseState, classId: string, studentId: string): Student {
    const student = state.students.find(
      (candidate) => candidate.id === studentId && candidate.classId === classId,
    )
    if (student === undefined) throw new ClassroomServiceError("STUDENT_NOT_FOUND", "学生不存在", 404)
    return student
  }

  private requireActiveStudent(state: MockDatabaseState, classId: string, studentId: string): Student {
    const student = this.requireStudent(state, classId, studentId)
    if (student.status !== "ACTIVE") {
      throw new ClassroomServiceError("STUDENT_NOT_FOUND", "在班学生不存在", 404)
    }
    return student
  }

  private assertStudentNoAvailable(
    state: MockDatabaseState,
    classId: string,
    studentNo: string | null,
    ignoredStudentId?: string,
  ): void {
    if (
      studentNo !== null &&
      state.students.some(
        (student) =>
          student.classId === classId && student.studentNo === studentNo && student.id !== ignoredStudentId,
      )
    ) {
      throw new ClassroomServiceError("STUDENT_NUMBER_CONFLICT", "该班级的学号已经存在", 409)
    }
  }

  private requireTeacherRelation(
    state: MockDatabaseState,
    classId: string,
    classTeacherId: string,
  ): ClassTeacher {
    const relation = state.teachers.find(
      (candidate) => candidate.id === classTeacherId && candidate.classId === classId,
    )
    if (relation === undefined) throw new ClassroomServiceError("TEACHER_NOT_FOUND", "教师关系不存在", 404)
    return relation
  }

  private requireOperator(
    state: MockDatabaseState,
    classId: string,
    operatorId = MOCK_HEAD_TEACHER_ID,
  ): ClassTeacher {
    const operator = state.teachers.find(
      (teacher) => teacher.teacherId === operatorId && teacher.classId === classId && teacher.status === "ACTIVE",
    )
    if (operator === undefined) throw new ClassroomServiceError("FORBIDDEN_CLASS_ACCESS", "教师无权访问该班级", 403)
    return operator
  }

  private requireScoreRule(state: MockDatabaseState, classId: string, ruleId: string): ScoreRule {
    const rule = state.scoreRules.find(
      (candidate) => candidate.id === ruleId && candidate.classId === classId,
    )
    if (rule === undefined) throw new ClassroomServiceError("SCORE_RULE_NOT_FOUND", "积分规则不存在", 404)
    return rule
  }

  private currentLayoutVersion(
    state: Readonly<MockDatabaseState>,
    classroom: Classroom,
  ): SeatLayoutVersion | undefined {
    return state.seatLayoutVersions.find(
      (version) => version.versionId === classroom.currentLayoutVersionId,
    )
  }

  private requireLayoutVersion(
    state: Readonly<MockDatabaseState>,
    classId: string,
    versionId: string,
  ): SeatLayoutVersion {
    const version = state.seatLayoutVersions.find(
      (candidate) => candidate.versionId === versionId && candidate.classId === classId,
    )
    if (version === undefined) throw new ClassroomServiceError("SEAT_LAYOUT_VERSION_NOT_FOUND", "座位版本不存在", 404)
    return version
  }

  private nextLayoutVersion(state: Readonly<MockDatabaseState>, classId: string): number {
    return Math.max(
      0,
      ...state.seatLayoutVersions
        .filter((version) => version.classId === classId)
        .map((version) => version.version ?? 0),
    ) + 1
  }

  private validateSeatDrafts(
    state: MockDatabaseState,
    classroom: Classroom,
    seats: SaveSeatLayoutInput["seats"],
  ): void {
    const coordinates = new Set<string>()
    const studentIds = new Set<string>()
    for (const seat of seats) {
      if (
        !Number.isInteger(seat.row) ||
        !Number.isInteger(seat.col) ||
        seat.row < 0 ||
        seat.col < 0 ||
        seat.row >= classroom.gridRows ||
        seat.col >= classroom.gridCols
      ) {
        throw new ClassroomServiceError("SEAT_OUT_OF_BOUNDS", "座位坐标超出教室网格", 400)
      }
      const coordinate = `${seat.row}:${seat.col}`
      if (coordinates.has(coordinate)) {
        throw new ClassroomServiceError("SEAT_COORDINATE_CONFLICT", "同一网格只能有一个座位", 409)
      }
      coordinates.add(coordinate)
      if (seat.studentId !== null) {
        if ((seat.cellType ?? "seat") !== "seat") {
          throw new ClassroomServiceError("SEAT_STUDENT_CONFLICT", "只有普通座位可以安排学生", 400)
        }
        if (studentIds.has(seat.studentId)) {
          throw new ClassroomServiceError("SEAT_STUDENT_CONFLICT", "同一学生不能出现在多个座位", 409)
        }
        studentIds.add(seat.studentId)
        this.requireActiveStudent(state, classroom.id, seat.studentId)
      }
    }
  }

  private toScoreRecord(state: Readonly<MockDatabaseState>, record: MockScoreRecord): ScoreRecord {
    const student = state.students.find((candidate) => candidate.id === record.studentId)
    const operator = state.teachers.find((candidate) => candidate.teacherId === record.operatorId)
    const rule = record.ruleId === null
      ? null
      : state.scoreRules.find((candidate) => candidate.id === record.ruleId) ?? null
    return {
      id: record.id,
      student: { id: record.studentId, name: student?.name ?? "历史学生" },
      operator: { id: record.operatorId, name: operator?.teacher.name ?? "历史教师" },
      subject: record.subject,
      rule: rule === null ? null : { id: rule.id, name: rule.name },
      delta: record.delta,
      reason: record.reason,
      recordType: record.recordType,
      reverted: record.reverted,
      createdAt: record.createdAt,
    }
  }

  private buildWeeklyRanking(state: Readonly<MockDatabaseState>, classId: string): WeeklyRanking {
    this.requireClassroom(state, classId)
    const activeStudents = state.students.filter(
      (student) => student.classId === classId && student.status === "ACTIVE",
    )
    const totals = new Map(activeStudents.map((student) => [student.id, 0]))
    for (const record of state.scoreRecords) {
      if (
        record.classId === classId &&
        record.createdAt >= MOCK_CURRENT_WEEK_START &&
        record.createdAt < MOCK_CURRENT_WEEK_END &&
        totals.has(record.studentId)
      ) {
        totals.set(record.studentId, (totals.get(record.studentId) ?? 0) + record.delta)
      }
    }
    const ranked = activeStudents
      .map((student) => ({ student, total: totals.get(student.id) ?? 0 }))
      .sort((left, right) => right.total - left.total || left.student.studentNo!.localeCompare(right.student.studentNo!))
      .map(({ student }, index) => ({ studentId: student.id, name: student.name, rank: index + 1 }))
    const progress = ranked
      .map((item) => {
        const previousRank = state.previousWeekRanks[item.studentId] ?? item.rank
        return {
          studentId: item.studentId,
          name: item.name,
          previousRank,
          currentRank: item.rank,
          change: previousRank - item.rank,
        }
      })
      .filter((item) => item.change > 0)
      .sort((left, right) => right.change - left.change || left.currentRank - right.currentRank)
      .slice(0, 8)

    return {
      period: { type: "WEEK", startAt: MOCK_CURRENT_WEEK_START, endAt: MOCK_CURRENT_WEEK_END },
      top3: ranked.slice(0, 3),
      progress,
      strategy: "WEEK_OVER_WEEK_RANK_CHANGE",
    }
  }

  private emitScoreEvents(classId: string, studentId: string, delta: number): void {
    this.emit(classId, "SCORE_CHANGED", {
      studentId,
      direction: delta > 0 ? "INCREASE" : "DECREASE",
    })
    this.emit(classId, "RANKING_CHANGED", { period: "WEEK" })
  }

  private emit<TType extends ClassEventType>(
    classId: string,
    type: TType,
    payload: RealtimeEventPayloads[TType],
  ): void {
    const identity = this.repository.issueIdentity("event")
    this.realtimeBus.publish({
      id: identity.id,
      type,
      classId,
      occurredAt: identity.occurredAt,
      payload,
    })
  }
}

export interface MockClassroomRuntime {
  repository: MockClassroomRepository
  service: MockClassroomService
  realtime: InMemoryRealtimeBus
}

let runtime: MockClassroomRuntime | undefined

export function createMockClassroomRuntime(): MockClassroomRuntime {
  const repository = new MockClassroomRepository()
  const realtime = new InMemoryRealtimeBus()
  const service = new MockClassroomService(repository, realtime)
  return { repository, service, realtime }
}

export function getMockClassroomRuntime(): MockClassroomRuntime {
  runtime ??= createMockClassroomRuntime()
  return runtime
}

export function resetMockClassroomRuntime(): MockClassroomRuntime {
  runtime = createMockClassroomRuntime()
  return runtime
}

export { MOCK_CLASS_ID, MOCK_HEAD_TEACHER_ID }
