import type {
  BindDisplayInput,
  BindDisplayResult,
  BindDisplayByCodeResult,
  ClassroomBindingSessionStatus,
  Classroom,
  ClassroomSummary,
  ClassTeacher,
  ConsumeInvitationInput,
  CreateBindingCodeResult,
  CreateClassroomBindingCodeResult,
  CreateCustomScoreInput,
  CreateScoreEventInput,
  CreateRuleScoreInput,
  CreateScoreRuleInput,
  CreateStudentInput,
  CreateTeacherInput,
  CreateTeacherResult,
  ClassSchedule,
  DeviceTokenInput,
  DeviceTokenResult,
  DisplayBootstrap,
  DisplayDevice,
  InvitationConsumeResult,
  ImportedStudentInput,
  LoginInput,
  LoginResult,
  LogoutResult,
  PaginatedEnvelope,
  PollBindingSessionInput,
  PollBindingSessionResult,
  RandomPickInput,
  RandomPickResult,
  RefreshInput,
  SaveSeatLayoutInput,
  SaveClassScheduleInput,
  ScoreRecord,
  ScoreEventResult,
  ScorePeriodSummary,
  CommitteeAssignment,
  UpdateCommitteeInput,
  ScoreRecordListQuery,
  ScoreRule,
  SeatLayout,
  SeatLayoutMutation,
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
  IsoDateTime,
} from "./domain"

export class ClassroomServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "ClassroomServiceError"
  }
}

export interface ClassroomService {
  listClassrooms(): Promise<ClassroomSummary[]>
  getClassroom(classId: string): Promise<Classroom>
  updateClassroom(classId: string, input: UpdateClassroomInput): Promise<Classroom>

  listStudents(classId: string, query?: StudentListQuery): Promise<PaginatedEnvelope<Student>>
  createStudent(classId: string, input: CreateStudentInput): Promise<Student>
  updateStudent(classId: string, studentId: string, input: UpdateStudentInput): Promise<Student>
  deactivateStudent(classId: string, studentId: string): Promise<Student>
  restoreStudent(classId: string, studentId: string): Promise<Student>
  deleteStudent(classId: string, studentId: string): Promise<Student>
  importStudents(classId: string, input: ImportedStudentInput[]): Promise<StudentImportResult>

  listTeachers(classId: string): Promise<ClassTeacher[]>
  createTeacher(classId: string, input: CreateTeacherInput): Promise<CreateTeacherResult>
  updateTeacher(
    classId: string,
    classTeacherId: string,
    input: UpdateTeacherInput,
  ): Promise<ClassTeacher>
  createTeacherInvitation(classId: string, classTeacherId: string): Promise<TeacherInvitation>
  revokeTeacher(classId: string, classTeacherId: string): Promise<{ revoked: true }>
  deleteTeacher(classId: string, classTeacherId: string): Promise<{ deleted: true }>
  restoreTeacher(classId: string, classTeacherId: string): Promise<{ restored: true }>

  listScoreRules(classId: string, enabled?: boolean): Promise<ScoreRule[]>
  createScoreRule(classId: string, input: CreateScoreRuleInput): Promise<ScoreRule>
  updateScoreRule(classId: string, ruleId: string, input: UpdateScoreRuleInput): Promise<ScoreRule>
  disableScoreRule(classId: string, ruleId: string): Promise<ScoreRule>
  listScoreRecords(
    classId: string,
    query?: ScoreRecordListQuery,
  ): Promise<PaginatedEnvelope<ScoreRecord>>
  createRuleScore(classId: string, input: CreateRuleScoreInput): Promise<ScoreRecord>
  createCustomScore(classId: string, input: CreateCustomScoreInput): Promise<ScoreRecord>
  revertScore(classId: string, recordId: string, operatorId?: string): Promise<ScoreRecord>
  createScoreEvent(classId: string, input: CreateScoreEventInput): Promise<ScoreEventResult>
  getCurrentScorePeriodSummary(classId: string): Promise<ScorePeriodSummary>
  getScorePeriodSummary(classId: string, query?: { from?: IsoDateTime; to?: IsoDateTime }): Promise<ScorePeriodSummary>
  listCommittee(classId: string): Promise<CommitteeAssignment[]>
  updateCommittee(classId: string, input: UpdateCommitteeInput): Promise<CommitteeAssignment[]>
  settleScorePeriods(classId: string, periodId?: string): Promise<{ settled: true }>

  getSeatLayout(classId: string): Promise<SeatLayout>
  listSeatLayoutVersions(
    classId: string,
    page?: number,
    pageSize?: number,
  ): Promise<PaginatedEnvelope<SeatLayoutVersionSummary>>
  getSeatLayoutVersion(classId: string, versionId: string): Promise<SeatLayout>
  saveSeatLayout(classId: string, input: SaveSeatLayoutInput): Promise<SeatLayoutMutation>
  restoreSeatLayout(classId: string, versionId: string): Promise<SeatLayoutMutation>

  getSchedule(classId: string): Promise<ClassSchedule>
  saveSchedule(classId: string, input: SaveClassScheduleInput): Promise<ClassSchedule>

  getWeeklyRanking(classId: string): Promise<WeeklyRanking>
  randomPick(classId: string, input?: RandomPickInput): Promise<RandomPickResult>

  createBindingCode(): Promise<CreateBindingCodeResult>
  createClassroomBindingCode(
    classId: string,
    name: string,
  ): Promise<CreateClassroomBindingCodeResult>
  getClassroomBindingSessionStatus(
    classId: string,
    sessionId: string,
  ): Promise<ClassroomBindingSessionStatus>
  bindDisplayByCode(code: string): Promise<BindDisplayByCodeResult>
  pollBindingSession(
    bindingSessionId: string,
    input: PollBindingSessionInput,
  ): Promise<PollBindingSessionResult>
  listDisplayDevices(classId: string): Promise<DisplayDevice[]>
  bindDisplayDevice(classId: string, input: BindDisplayInput): Promise<BindDisplayResult>
  revokeDisplayDevice(classId: string, deviceId: string): Promise<BindDisplayResult>
  exchangeDeviceCredential(input: DeviceTokenInput): Promise<DeviceTokenResult>
  getDisplayBootstrap(deviceId: string): Promise<DisplayBootstrap>

  login(input: LoginInput): Promise<LoginResult>
  logout(): Promise<LogoutResult>
  refresh(input: RefreshInput): Promise<TokenPair>
  consumeInvitation(token: string, input: ConsumeInvitationInput): Promise<InvitationConsumeResult>
}
