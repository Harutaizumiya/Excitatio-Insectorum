import {
  ClassroomServiceError,
  type ClassroomService,
} from "./classroom-service"
import type {
  BindDisplayByCodeResult,
  BindDisplayInput,
  BindDisplayResult,
  Classroom,
  ClassSchedule,
  ClassroomBindingSessionStatus,
  ClassroomSummary,
  ClassTeacher,
  ConsumeInvitationInput,
  CreateBindingCodeResult,
  CreateClassroomBindingCodeResult,
  CreateCustomScoreInput,
  CreateRuleScoreInput,
  CreateScoreRuleInput,
  CreateStudentInput,
  CreateTeacherInput,
  CreateTeacherResult,
  DeviceTokenInput,
  DeviceTokenResult,
  DisplayBootstrap,
  DisplayDevice,
  ImportedStudentInput,
  InvitationConsumeResult,
  LoginInput,
  LoginResult,
  PaginatedEnvelope,
  PollBindingSessionInput,
  PollBindingSessionResult,
  RandomPickInput,
  RandomPickResult,
  RefreshInput,
  SaveSeatLayoutInput,
  SaveClassScheduleInput,
  ScoreRecord,
  ScoreRecordListQuery,
  ScoreRule,
  SeatLayout,
  SeatLayoutMutation,
  SeatLayoutVersion,
  SeatLayoutVersionSummary,
  Student,
  StudentImportResult,
  StudentListQuery,
  TeacherInvitation,
  TokenPair,
  UpdateClassroomInput,
  UpdateScoreRuleInput,
  UpdateStudentInput,
  UpdateTeacherInput,
  WeeklyRanking,
} from "./domain"
import {
  getDisplaySession,
  getUserSession,
  setActiveClassId,
  setDisplaySession,
  setUserSession,
} from "./session"

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "")

interface RequestOptions {
  auth?: "user" | "display" | "none"
  retry?: boolean
}

interface ApiErrorPayload {
  code?: unknown
  message?: unknown
  requestId?: unknown
}

function isEnvelope(value: unknown): value is { data: unknown } {
  return typeof value === "object" && value !== null && "data" in value
}

function isPaginatedPayload(value: unknown): boolean {
  return typeof value === "object" && value !== null && "meta" in value
}

function errorPayload(value: unknown, status: number): ClassroomServiceError {
  const payload = (typeof value === "object" && value !== null ? value : {}) as ApiErrorPayload
  const code = typeof payload.code === "string" ? payload.code : "REQUEST_FAILED"
  const message = typeof payload.message === "string" ? payload.message : "请求失败，请稍后重试"
  return new ClassroomServiceError(code, message, status)
}

function queryString(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") search.set(key, String(value))
  }
  const value = search.toString()
  return value ? `?${value}` : ""
}

function jsonBody(body: unknown): BodyInit {
  return JSON.stringify(body)
}

export class ApiClassroomService implements ClassroomService {
  private userRefreshPromise: Promise<boolean> | null = null
  private displayRefreshPromise: Promise<boolean> | null = null

  private async request<T>(
    path: string,
    init: RequestInit = {},
    options: RequestOptions = {},
  ): Promise<T> {
    const auth = options.auth ?? "user"
    const headers = new Headers(init.headers)
    if (init.body !== undefined && !(init.body instanceof FormData)) {
      headers.set("content-type", "application/json")
    }

    const token = auth === "user" ? getUserSession()?.accessToken : auth === "display" ? getDisplaySession()?.accessToken : null
    if (token) headers.set("authorization", `Bearer ${token}`)

    let response: Response
    try {
      response = await fetch(`${API_ORIGIN}/api/v1${path}`, { ...init, headers })
    } catch {
      throw new ClassroomServiceError("API_UNAVAILABLE", "无法连接到后端服务，请确认服务已启动", 503)
    }

    if (response.status === 401 && options.retry !== false && auth !== "none") {
      const refreshed = auth === "user" ? await this.refreshUserSession() : await this.refreshDisplaySession()
      if (refreshed) {
        return this.request<T>(path, init, { ...options, retry: false })
      }
    }

    const payload = await response.json().catch(() => null)
    if (!response.ok) throw errorPayload(payload, response.status)
    return (isEnvelope(payload) && !isPaginatedPayload(payload) ? payload.data : payload) as T
  }

  private refreshUserSession(): Promise<boolean> {
    if (this.userRefreshPromise) return this.userRefreshPromise
    this.userRefreshPromise = (async () => {
      const session = getUserSession()
      if (!session?.refreshToken) return false
      try {
        const tokens = await this.request<TokenPair>(
          "/auth/refresh",
          { method: "POST", body: jsonBody({ refreshToken: session.refreshToken }) },
          { auth: "none", retry: false },
        )
        setUserSession({ ...session, ...tokens })
        return true
      } catch {
        return false
      }
    })().finally(() => {
      this.userRefreshPromise = null
    })
    return this.userRefreshPromise
  }

  private refreshDisplaySession(): Promise<boolean> {
    if (this.displayRefreshPromise) return this.displayRefreshPromise
    this.displayRefreshPromise = (async () => {
      const session = getDisplaySession()
      if (!session?.credential) return false
      try {
        const token = await this.request<DeviceTokenResult>(
          "/display/auth/token",
          { method: "POST", body: jsonBody({ deviceId: session.deviceId, credential: session.credential }) },
          { auth: "none", retry: false },
        )
        setDisplaySession({
          ...session,
          accessToken: token.accessToken,
          expiresAt: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
        })
        return true
      } catch {
        return false
      }
    })().finally(() => {
      this.displayRefreshPromise = null
    })
    return this.displayRefreshPromise
  }

  async listClassrooms(): Promise<ClassroomSummary[]> {
    return this.request<ClassroomSummary[]>("/classes")
  }

  async getClassroom(classId: string): Promise<Classroom> {
    return this.request<Classroom>(`/classes/${encodeURIComponent(classId)}`)
  }

  async updateClassroom(classId: string, input: UpdateClassroomInput): Promise<Classroom> {
    return this.request<Classroom>(`/classes/${encodeURIComponent(classId)}`, {
      method: "PATCH",
      body: jsonBody(input),
    })
  }

  async listStudents(classId: string, query: StudentListQuery = {}): Promise<PaginatedEnvelope<Student>> {
    return this.request<PaginatedEnvelope<Student>>(
      `/classes/${encodeURIComponent(classId)}/students${queryString(query)}`,
    )
  }

  async createStudent(classId: string, input: CreateStudentInput): Promise<Student> {
    return this.request<Student>(`/classes/${encodeURIComponent(classId)}/students`, {
      method: "POST",
      body: jsonBody(input),
    })
  }

  async updateStudent(classId: string, studentId: string, input: UpdateStudentInput): Promise<Student> {
    return this.request<Student>(`/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`, {
      method: "PATCH",
      body: jsonBody(input),
    })
  }

  async deactivateStudent(classId: string, studentId: string): Promise<Student> {
    return this.request<Student>(`/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/deactivate`, {
      method: "POST",
    })
  }

  async importStudents(classId: string, input: ImportedStudentInput[]): Promise<StudentImportResult> {
    return this.request<StudentImportResult>(`/classes/${encodeURIComponent(classId)}/students/import`, {
      method: "POST",
      body: jsonBody({ students: input }),
    })
  }

  async listTeachers(classId: string): Promise<ClassTeacher[]> {
    return this.request<ClassTeacher[]>(`/classes/${encodeURIComponent(classId)}/teachers`)
  }

  async createTeacher(classId: string, input: CreateTeacherInput): Promise<CreateTeacherResult> {
    return this.request<CreateTeacherResult>(`/classes/${encodeURIComponent(classId)}/teachers`, {
      method: "POST",
      body: jsonBody(input),
    })
  }

  async updateTeacher(classId: string, classTeacherId: string, input: UpdateTeacherInput): Promise<ClassTeacher> {
    return this.request<ClassTeacher>(`/classes/${encodeURIComponent(classId)}/teachers/${encodeURIComponent(classTeacherId)}`, {
      method: "PATCH",
      body: jsonBody(input),
    })
  }

  async createTeacherInvitation(classId: string, classTeacherId: string): Promise<TeacherInvitation> {
    return this.request<TeacherInvitation>(`/classes/${encodeURIComponent(classId)}/teachers/${encodeURIComponent(classTeacherId)}/invitations`, {
      method: "POST",
    })
  }

  async revokeTeacher(classId: string, classTeacherId: string): Promise<{ revoked: true }> {
    return this.request<{ revoked: true }>(`/classes/${encodeURIComponent(classId)}/teachers/${encodeURIComponent(classTeacherId)}/revoke`, {
      method: "POST",
    })
  }

  async restoreTeacher(classId: string, classTeacherId: string): Promise<{ restored: true }> {
    return this.request<{ restored: true }>(`/classes/${encodeURIComponent(classId)}/teachers/${encodeURIComponent(classTeacherId)}/restore`, {
      method: "POST",
    })
  }

  async listScoreRules(classId: string, enabled?: boolean): Promise<ScoreRule[]> {
    return this.request<ScoreRule[]>(`/classes/${encodeURIComponent(classId)}/score-rules${queryString({ enabled })}`)
  }

  async createScoreRule(classId: string, input: CreateScoreRuleInput): Promise<ScoreRule> {
    return this.request<ScoreRule>(`/classes/${encodeURIComponent(classId)}/score-rules`, {
      method: "POST",
      body: jsonBody(input),
    })
  }

  async updateScoreRule(classId: string, ruleId: string, input: UpdateScoreRuleInput): Promise<ScoreRule> {
    return this.request<ScoreRule>(`/classes/${encodeURIComponent(classId)}/score-rules/${encodeURIComponent(ruleId)}`, {
      method: "PATCH",
      body: jsonBody(input),
    })
  }

  async disableScoreRule(classId: string, ruleId: string): Promise<ScoreRule> {
    return this.request<ScoreRule>(`/classes/${encodeURIComponent(classId)}/score-rules/${encodeURIComponent(ruleId)}/disable`, {
      method: "POST",
    })
  }

  async listScoreRecords(classId: string, query: ScoreRecordListQuery = {}): Promise<PaginatedEnvelope<ScoreRecord>> {
    return this.request<PaginatedEnvelope<ScoreRecord>>(`/classes/${encodeURIComponent(classId)}/scores${queryString(query)}`)
  }

  async createRuleScore(classId: string, input: CreateRuleScoreInput): Promise<ScoreRecord> {
    return this.request<ScoreRecord>(`/classes/${encodeURIComponent(classId)}/scores/rule`, {
      method: "POST",
      body: jsonBody(input),
    })
  }

  async createCustomScore(classId: string, input: CreateCustomScoreInput): Promise<ScoreRecord> {
    return this.request<ScoreRecord>(`/classes/${encodeURIComponent(classId)}/scores/custom`, {
      method: "POST",
      body: jsonBody(input),
    })
  }

  async revertScore(classId: string, recordId: string): Promise<ScoreRecord> {
    return this.request<ScoreRecord>(`/classes/${encodeURIComponent(classId)}/scores/${encodeURIComponent(recordId)}/revert`, {
      method: "POST",
    })
  }

  async getSeatLayout(classId: string): Promise<SeatLayout> {
    return this.request<SeatLayout>(`/classes/${encodeURIComponent(classId)}/seat-layout`)
  }

  async listSeatLayoutVersions(classId: string, page = 1, pageSize = 20): Promise<PaginatedEnvelope<SeatLayoutVersionSummary>> {
    return this.request<PaginatedEnvelope<SeatLayoutVersionSummary>>(`/classes/${encodeURIComponent(classId)}/seat-layout/versions${queryString({ page, pageSize })}`)
  }

  async getSeatLayoutVersion(classId: string, versionId: string): Promise<SeatLayoutVersion> {
    return this.request<SeatLayoutVersion>(`/classes/${encodeURIComponent(classId)}/seat-layout/versions/${encodeURIComponent(versionId)}`)
  }

  async saveSeatLayout(classId: string, input: SaveSeatLayoutInput): Promise<SeatLayoutMutation> {
    return this.request<SeatLayoutMutation>(`/classes/${encodeURIComponent(classId)}/seat-layout`, {
      method: "PUT",
      body: jsonBody(input),
    })
  }

  async restoreSeatLayout(classId: string, versionId: string): Promise<SeatLayoutMutation & { sourceVersionId: string }> {
    return this.request<SeatLayoutMutation & { sourceVersionId: string }>(`/classes/${encodeURIComponent(classId)}/seat-layout/versions/${encodeURIComponent(versionId)}/restore`, {
      method: "POST",
    })
  }

  async getSchedule(classId: string): Promise<ClassSchedule> {
    return this.request<ClassSchedule>(`/classes/${encodeURIComponent(classId)}/schedule`)
  }

  async saveSchedule(classId: string, input: SaveClassScheduleInput): Promise<ClassSchedule> {
    return this.request<ClassSchedule>(`/classes/${encodeURIComponent(classId)}/schedule`, {
      method: "PUT",
      body: jsonBody(input),
    })
  }

  async getWeeklyRanking(classId: string): Promise<WeeklyRanking> {
    return this.request<WeeklyRanking>(`/classes/${encodeURIComponent(classId)}/ranking`)
  }

  async randomPick(classId: string, input: RandomPickInput = {}): Promise<RandomPickResult> {
    return this.request<RandomPickResult>(`/classes/${encodeURIComponent(classId)}/random-pick`, {
      method: "POST",
      body: jsonBody(input),
    })
  }

  async createBindingCode(): Promise<CreateBindingCodeResult> {
    return this.request<CreateBindingCodeResult>("/display/binding-codes", { method: "POST" }, { auth: "none" })
  }

  async createClassroomBindingCode(classId: string, name: string): Promise<CreateClassroomBindingCodeResult> {
    return this.request<CreateClassroomBindingCodeResult>(`/classes/${encodeURIComponent(classId)}/display-devices/binding-code`, {
      method: "POST",
      body: jsonBody({ name }),
    })
  }

  async getClassroomBindingSessionStatus(classId: string, sessionId: string): Promise<ClassroomBindingSessionStatus> {
    return this.request<ClassroomBindingSessionStatus>(`/classes/${encodeURIComponent(classId)}/display-devices/binding-sessions/${encodeURIComponent(sessionId)}`)
  }

  async pollBindingSession(bindingSessionId: string, input: PollBindingSessionInput): Promise<PollBindingSessionResult> {
    return this.request<PollBindingSessionResult>(`/display/binding-sessions/${encodeURIComponent(bindingSessionId)}/poll`, {
      method: "POST",
      body: jsonBody(input),
    }, { auth: "none" })
  }

  async bindDisplayDevice(classId: string, input: BindDisplayInput): Promise<BindDisplayResult> {
    return this.request<BindDisplayResult>(`/classes/${encodeURIComponent(classId)}/display-devices/bind`, {
      method: "POST",
      body: jsonBody(input),
    })
  }

  async bindDisplayByCode(code: string): Promise<BindDisplayByCodeResult> {
    const result = await this.request<BindDisplayByCodeResult>("/display/bind-by-code", {
      method: "POST",
      body: jsonBody({ code }),
    }, { auth: "none" })
    const token = await this.exchangeDeviceCredential({ deviceId: result.deviceId, credential: result.credential })
    setDisplaySession({
      deviceId: result.deviceId,
      classId: result.classroom.id,
      credential: result.credential,
      accessToken: token.accessToken,
      expiresAt: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
    })
    return result
  }

  async listDisplayDevices(classId: string): Promise<DisplayDevice[]> {
    return this.request<DisplayDevice[]>(`/classes/${encodeURIComponent(classId)}/display-devices`)
  }

  async revokeDisplayDevice(classId: string, deviceId: string): Promise<BindDisplayResult> {
    return this.request<BindDisplayResult>(`/classes/${encodeURIComponent(classId)}/display-devices/${encodeURIComponent(deviceId)}/revoke`, {
      method: "POST",
    })
  }

  async exchangeDeviceCredential(input: DeviceTokenInput): Promise<DeviceTokenResult> {
    const result = await this.request<DeviceTokenResult>("/display/auth/token", {
      method: "POST",
      body: jsonBody(input),
    }, { auth: "none" })
    setDisplaySession({
      deviceId: input.deviceId,
      credential: input.credential,
      accessToken: result.accessToken,
      expiresAt: new Date(Date.now() + result.expiresIn * 1000).toISOString(),
    })
    return result
  }

  async getDisplayBootstrap(deviceId: string): Promise<DisplayBootstrap> {
    const session = getDisplaySession()
    if (!session || session.deviceId !== deviceId) {
      throw new ClassroomServiceError("DISPLAY_SESSION_MISSING", "请先完成大屏绑定", 401)
    }
    return this.request<DisplayBootstrap>("/display/bootstrap", undefined, { auth: "display" })
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const result = await this.request<LoginResult>("/auth/login", {
      method: "POST",
      body: jsonBody(input),
    }, { auth: "none" })
    setUserSession(result)
    return result
  }

  async refresh(input: RefreshInput): Promise<TokenPair> {
    const tokens = await this.request<TokenPair>("/auth/refresh", {
      method: "POST",
      body: jsonBody(input),
    }, { auth: "none" })
    const current = getUserSession()
    if (current) setUserSession({ ...current, ...tokens })
    return tokens
  }

  async consumeInvitation(token: string, input: ConsumeInvitationInput): Promise<InvitationConsumeResult> {
    const result = await this.request<InvitationConsumeResult>(`/auth/invitations/${encodeURIComponent(token)}/consume`, {
      method: "POST",
      body: jsonBody(input),
    }, { auth: "none" })
    setUserSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: { id: result.teacher.id, name: result.teacher.name },
    })
    setActiveClassId(result.classroom.id)
    return result
  }
}

export const apiClassroomService = new ApiClassroomService()
