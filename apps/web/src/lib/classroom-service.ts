import type {
  BindDisplayInput,
  BindDisplayResult,
  Classroom,
  ClassroomSummary,
  ClassTeacher,
  ConsumeInvitationInput,
  CreateBindingCodeResult,
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
  ScoreRecord,
  ScoreRecordListQuery,
  ScoreRule,
  SeatLayout,
  SeatLayoutMutation,
  SeatLayoutVersionSummary,
  Student,
  StudentListQuery,
  TeacherInvitation,
  TokenPair,
  UpdateClassroomInput,
  UpdateScoreRuleInput,
  UpdateStudentInput,
  UpdateTeacherInput,
  WeeklyRanking,
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

  listTeachers(classId: string): Promise<ClassTeacher[]>
  createTeacher(classId: string, input: CreateTeacherInput): Promise<CreateTeacherResult>
  updateTeacher(
    classId: string,
    classTeacherId: string,
    input: UpdateTeacherInput,
  ): Promise<ClassTeacher>
  createTeacherInvitation(classId: string, classTeacherId: string): Promise<TeacherInvitation>
  revokeTeacher(classId: string, classTeacherId: string): Promise<{ revoked: true }>

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

  getSeatLayout(classId: string): Promise<SeatLayout>
  listSeatLayoutVersions(
    classId: string,
    page?: number,
    pageSize?: number,
  ): Promise<PaginatedEnvelope<SeatLayoutVersionSummary>>
  getSeatLayoutVersion(classId: string, versionId: string): Promise<SeatLayout>
  saveSeatLayout(classId: string, input: SaveSeatLayoutInput): Promise<SeatLayoutMutation>
  restoreSeatLayout(classId: string, versionId: string): Promise<SeatLayoutMutation>

  getWeeklyRanking(classId: string): Promise<WeeklyRanking>
  randomPick(classId: string, input?: RandomPickInput): Promise<RandomPickResult>

  createBindingCode(): Promise<CreateBindingCodeResult>
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
  refresh(input: RefreshInput): Promise<TokenPair>
  consumeInvitation(token: string, input: ConsumeInvitationInput): Promise<InvitationConsumeResult>
}
