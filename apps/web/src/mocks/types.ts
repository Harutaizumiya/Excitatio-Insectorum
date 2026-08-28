import type {
  Classroom,
  ClassTeacher,
  DeviceStatus,
  DisplayDevice,
  IsoDateTime,
  ScoreRecordType,
  ScoreRule,
  SeatLayoutVersion,
  Student,
} from "@/lib/domain"

export interface MockScoreRecord {
  id: string
  classId: string
  studentId: string
  operatorId: string
  subject: string | null
  ruleId: string | null
  delta: number
  reason: string | null
  recordType: ScoreRecordType
  reverted: boolean
  revertedRecordId: string | null
  createdAt: IsoDateTime
}

export interface MockTeacherInvitation {
  token: string
  classTeacherId: string
  expiresAt: IsoDateTime
  status: "PENDING" | "USED" | "EXPIRED" | "REVOKED"
}

export interface MockBindingSession {
  id: string
  code: string
  nonce: string
  expiresAt: IsoDateTime
  status: "PENDING" | "READY" | "CLAIMED"
  deviceId: string | null
  credential: string | null
}

export interface MockDisplayDevice extends DisplayDevice {
  classId: string
}

export interface MockDatabaseState {
  classrooms: Classroom[]
  students: Student[]
  teachers: ClassTeacher[]
  scoreRules: ScoreRule[]
  scoreRecords: MockScoreRecord[]
  seatLayoutVersions: SeatLayoutVersion[]
  displayDevices: MockDisplayDevice[]
  invitations: MockTeacherInvitation[]
  bindingSessions: MockBindingSession[]
  deviceCredentials: Record<string, string>
  previousWeekRanks: Record<string, number>
  counters: {
    entity: number
    event: number
    randomPick: number
    clockTick: number
    bindingCode: number
  }
}

export interface CreateMockDeviceInput {
  id: string
  classId: string
  name: string
  status: DeviceStatus
  lastSeenAt: IsoDateTime | null
  createdAt: IsoDateTime
  revokedAt: IsoDateTime | null
  online: boolean
}
