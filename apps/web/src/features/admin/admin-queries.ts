"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  classroom,
  initialNotifications,
  type AdminNotification,
  type DisplayDevice,
  type ScoreRecord,
  type ScoreRule,
  type Seat,
  type SeatLayoutVersion,
  type Student,
  type Teacher,
  type TeacherStatus,
  formatSeat,
} from "./admin-data"
import type {
  ClassTeacher,
  ImportedStudentInput,
  ScoreRecord as ApiScoreRecord,
  ScoreRule as ApiScoreRule,
  SeatLayout,
  SeatLayoutVersionSummary,
  Student as ApiStudent,
  DisplayDevice as ApiDisplayDevice,
} from "@/lib"
import { useClassroomService } from "@/components/providers/classroom-system-provider"
import { getActiveClassId, getUserSession } from "@/lib/session"
import { displayBindingMock, type AdminBindingSession } from "@/features/classroom/display-binding-adapter"

export const adminQueryKeys = {
  all: ["admin"] as const,
  students: () => ["admin", "students"] as const,
  teachers: () => ["admin", "teachers"] as const,
  scoreRules: () => ["admin", "score-rules"] as const,
  scoreRecords: () => ["admin", "score-records"] as const,
  displayDevices: () => ["admin", "display-devices"] as const,
  seating: () => ["admin", "seating"] as const,
  notifications: () => ["admin", "notifications"] as const,
}

const FALLBACK_CLASS_ID = "class-1"
const STALE_TIME = 10 * 60 * 1000

export interface SeatingDraft {
  gridRows: number
  gridCols: number
  seats: Seat[]
}

type SeatingQueryData = { draft: SeatingDraft; saved: SeatingDraft; versions: SeatLayoutVersion[] }

function currentClassId(): string {
  return getActiveClassId() ?? FALLBACK_CLASS_ID
}

function displayDate(value: string | null | undefined): string {
  return value ? value.replace("T", " ").slice(0, 19) : "未上线"
}

function mapStudent(student: ApiStudent, seatByStudent = new Map<string, string>()): Student {
  return {
    id: student.id,
    name: student.name,
    studentNo: student.studentNo ?? "",
    status: student.status,
    seat: seatByStudent.get(student.id) ?? null,
    updatedAt: displayDate(student.updatedAt),
    createdAt: displayDate(student.createdAt).slice(0, 10),
  }
}

function seatMap(layout: SeatLayout): Map<string, string> {
  return new Map(
    layout.seats
      .filter((seat) => seat.student)
      .map((seat) => [seat.student!.id, formatSeat(seat.row, seat.col)]),
  )
}

function mapTeacher(relation: ClassTeacher): Teacher {
  const invitation = relation.invitations?.[0]
  const invitationPending = invitation?.status === "PENDING" && Date.parse(invitation.expiresAt) > Date.now()
  const teacherStatus = String(relation.teacher.status)
  const status: TeacherStatus = relation.status !== "ACTIVE" || teacherStatus === "DISABLED"
    ? "DISABLED"
    : invitationPending
      ? "PENDING"
      : "ACTIVE"
  return {
    id: relation.id,
    name: relation.teacher.name,
    subject: relation.subject ?? "",
    status,
    invitationUrl: null,
    invitationExpiresAt: invitationPending ? displayDate(invitation?.expiresAt) : null,
    lastActiveAt: null,
  }
}

function mapRule(rule: ApiScoreRule): ScoreRule {
  return {
    id: rule.id,
    name: rule.name,
    group: rule.group ?? "课堂表现",
    delta: rule.delta,
    description: rule.description ?? "",
    enabled: rule.enabled,
    updatedAt: displayDate(rule.updatedAt),
  }
}

function mapRecord(record: ApiScoreRecord): ScoreRecord {
  return {
    id: record.id,
    studentId: record.student.id,
    studentName: record.student.name,
    operatorId: record.operator.id,
    operatorName: record.operator.name,
    subject: record.subject ?? "",
    ruleName: record.rule?.name ?? null,
    delta: record.delta,
    reason: record.reason,
    recordType: record.recordType,
    reverted: record.reverted,
    createdAt: displayDate(record.createdAt),
  }
}

function mapDevice(device: ApiDisplayDevice): DisplayDevice {
  return {
    id: device.id,
    name: device.name,
    status: device.status === "ACTIVE" && device.online ? "ONLINE" : "OFFLINE",
    lastSeenAt: displayDate(device.lastSeenAt),
    boundAt: displayDate(device.createdAt),
  }
}

function mapSeats(layout: SeatLayout): Seat[] {
  return layout.seats.map((seat) => ({
    id: seat.id,
    row: seat.row,
    col: seat.col,
    studentId: seat.student?.id ?? null,
    cellType: seat.cellType ?? "seat",
  }))
}

function mapVersion(summary: SeatLayoutVersionSummary, layout: SeatLayout): SeatLayoutVersion {
  return {
    id: summary.versionId,
    version: summary.version,
    createdAt: displayDate(summary.createdAt),
    createdBy: summary.createdBy,
    gridRows: layout.rows,
    gridCols: layout.cols,
    seats: mapSeats(layout),
    sourceVersionId: summary.sourceVersionId,
  }
}

function initialSeating(): SeatingQueryData {
  const draft: SeatingDraft = { gridRows: classroom.gridRows, gridCols: classroom.gridCols, seats: [] }
  return { draft, saved: { ...draft, seats: [] }, versions: [] }
}

async function loadSeating(service: ReturnType<typeof useClassroomService>, classId: string): Promise<SeatingQueryData> {
  const [current, summaries] = await Promise.all([
    service.getSeatLayout(classId),
    service.listSeatLayoutVersions(classId, 1, 20),
  ])
  const versions = await Promise.all(
    summaries.data.map(async (summary) => mapVersion(summary, await service.getSeatLayoutVersion(classId, summary.versionId))),
  )
  const saved: SeatingDraft = { gridRows: current.rows, gridCols: current.cols, seats: mapSeats(current) }
  return {
    draft: { ...saved, seats: saved.seats.map((seat) => ({ ...seat })) },
    saved,
    versions,
  }
}

export function useAdminStudents() {
  const service = useClassroomService()
  const classId = currentClassId()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: adminQueryKeys.students(),
    queryFn: async () => {
      const [result, layout] = await Promise.all([
        service.listStudents(classId, { page: 1, pageSize: 100 }),
        service.getSeatLayout(classId),
      ])
      return result.data.map((student) => mapStudent(student, seatMap(layout)))
    },
    staleTime: STALE_TIME,
  })
  const saveStudentMutation = useMutation({
    mutationFn: ({ editingStudent, values }: { editingStudent: Student | null; values: { name: string; studentNo: string } }) =>
      editingStudent ? service.updateStudent(classId, editingStudent.id, values) : service.createStudent(classId, values),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminQueryKeys.students() }),
  })
  const deactivateMutation = useMutation({
    mutationFn: (student: Student) => service.deactivateStudent(classId, student.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.students() })
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.seating() })
    },
  })
  const batchImportMutation = useMutation({
    mutationFn: async (students: ImportedStudentInput[]) => {
      if (service.importStudents) return service.importStudents(classId, students)
      let created = 0
      for (const student of students) {
        await service.createStudent(classId, { name: student.name, studentNo: student.studentNo ?? undefined })
        created += 1
      }
      return { created, skipped: students.length - created, duplicates: [], errors: [] }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminQueryKeys.students() }),
  })
  return {
    students: query.data ?? [],
    saveStudent: saveStudentMutation.mutateAsync,
    deactivateStudent: deactivateMutation.mutateAsync,
    batchImportStudents: batchImportMutation.mutateAsync,
    isLoading: query.isLoading,
  }
}

export function useAdminTeachers() {
  const service = useClassroomService()
  const classId = currentClassId()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: adminQueryKeys.teachers(),
    queryFn: async () => (await service.listTeachers(classId)).map(mapTeacher),
    staleTime: STALE_TIME,
  })
  const createTeacherMutation = useMutation({
    mutationFn: async (values: { name: string; subject: string }) => {
      const created = await service.createTeacher(classId, values)
      const invitation = await service.createTeacherInvitation(classId, created.classTeacherId)
      const teacher: Teacher = {
        id: created.classTeacherId,
        name: values.name,
        subject: values.subject,
        status: "PENDING",
        invitationUrl: invitation.inviteUrl,
        invitationExpiresAt: displayDate(invitation.expiresAt),
        lastActiveAt: null,
      }
      return { invitedTeacher: teacher, url: invitation.inviteUrl, updatedList: [...(query.data ?? []), teacher] }
    },
    onSuccess: ({ updatedList }) => queryClient.setQueryData(adminQueryKeys.teachers(), updatedList),
  })
  const generateInvitationMutation = useMutation({
    mutationFn: async (teacherId: string) => {
      const invitation = await service.createTeacherInvitation(classId, teacherId)
      const current = queryClient.getQueryData<Teacher[]>(adminQueryKeys.teachers()) ?? []
      const teacher = current.find((item) => item.id === teacherId)
      if (!teacher) throw new Error("教师关系不存在")
      const updatedTeacher: Teacher = { ...teacher, status: "PENDING", invitationUrl: invitation.inviteUrl, invitationExpiresAt: displayDate(invitation.expiresAt) }
      return { updatedList: current.map((item) => item.id === teacherId ? updatedTeacher : item), updatedTeacher, url: invitation.inviteUrl }
    },
    onSuccess: ({ updatedList }) => queryClient.setQueryData(adminQueryKeys.teachers(), updatedList),
  })
  const setTeacherStatusMutation = useMutation({
    mutationFn: async ({ teacherId, status }: { teacherId: string; status: TeacherStatus }) => {
      if (status === "DISABLED") await service.revokeTeacher(classId, teacherId)
      else if (service.restoreTeacher) await service.restoreTeacher(classId, teacherId)
      const current = queryClient.getQueryData<Teacher[]>(adminQueryKeys.teachers()) ?? []
      return current.map((teacher) => teacher.id === teacherId ? { ...teacher, status } : teacher)
    },
    onSuccess: (updated) => queryClient.setQueryData(adminQueryKeys.teachers(), updated),
  })
  const deleteTeacherMutation = useMutation({
    mutationFn: async (teacherId: string) => {
      await service.revokeTeacher(classId, teacherId)
      return (queryClient.getQueryData<Teacher[]>(adminQueryKeys.teachers()) ?? []).filter((teacher) => teacher.id !== teacherId)
    },
    onSuccess: (updated) => queryClient.setQueryData(adminQueryKeys.teachers(), updated),
  })
  return {
    teachers: query.data ?? [],
    createTeacher: createTeacherMutation.mutateAsync,
    generateInvitation: generateInvitationMutation.mutateAsync,
    setTeacherStatus: setTeacherStatusMutation.mutateAsync,
    deleteTeacher: deleteTeacherMutation.mutateAsync,
    isLoading: query.isLoading,
  }
}

export function useAdminScoreRules() {
  const service = useClassroomService()
  const classId = currentClassId()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: adminQueryKeys.scoreRules(),
    queryFn: async () => (await service.listScoreRules(classId)).map(mapRule),
    staleTime: STALE_TIME,
  })
  const saveRuleMutation = useMutation({
    mutationFn: async ({ editing, values }: { editing: ScoreRule | null; values: { name: string; group?: string; delta?: number; description?: string } }) => {
      const input = { name: values.name, group: values.group?.trim() || "课堂表现", delta: values.delta ?? 0, description: values.description ?? "" }
      return editing ? service.updateScoreRule(classId, editing.id, input) : service.createScoreRule(classId, input)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminQueryKeys.scoreRules() }),
  })
  const toggleRuleMutation = useMutation({
    mutationFn: (rule: ScoreRule) => service.updateScoreRule(classId, rule.id, { enabled: !rule.enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminQueryKeys.scoreRules() }),
  })
  const deleteRuleMutation = useMutation({
    mutationFn: (rule: ScoreRule) => service.disableScoreRule(classId, rule.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminQueryKeys.scoreRules() }),
  })
  return { rules: query.data ?? [], saveRule: saveRuleMutation.mutateAsync, toggleRule: toggleRuleMutation.mutateAsync, deleteRule: deleteRuleMutation.mutateAsync, isLoading: query.isLoading }
}

export function useAdminScoreRecords() {
  const service = useClassroomService()
  const classId = currentClassId()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: adminQueryKeys.scoreRecords(),
    queryFn: async () => (await service.listScoreRecords(classId, { page: 1, pageSize: 100 })).data.map(mapRecord),
    staleTime: STALE_TIME,
  })
  const revertMutation = useMutation({
    mutationFn: (record: ScoreRecord) => service.revertScore(classId, record.id, getUserSession()?.user.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.scoreRecords() })
      void queryClient.invalidateQueries({ queryKey: ["classrooms", classId, "ranking"] })
    },
  })
  return { records: query.data ?? [], revertRecord: revertMutation.mutateAsync, isLoading: query.isLoading }
}

export function useAdminDisplayDevices() {
  const service = useClassroomService()
  const classId = currentClassId()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: adminQueryKeys.displayDevices(),
    queryFn: async () =>
      (await service.listDisplayDevices(classId))
        .filter((device) => device.status === "ACTIVE")
        .map(mapDevice),
    staleTime: STALE_TIME,
  })
  const createBindingCodeMutation = useMutation({
    mutationFn: async (name: string): Promise<AdminBindingSession> => {
      if (!service.createClassroomBindingCode) return displayBindingMock.createAdminBindingCode(name)
      const created = await service.createClassroomBindingCode(classId, name)
      return { sessionId: created.sessionId, code: created.code, deviceName: name.trim(), expiresAt: created.expiresAt, status: "PENDING" }
    },
  })
  const pollBindingSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      if (!service.getClassroomBindingSessionStatus) return displayBindingMock.pollAdminSession(sessionId)
      return service.getClassroomBindingSessionStatus(classId, sessionId)
    },
    onSuccess: (result) => {
      if (result.status === "READY") void queryClient.invalidateQueries({ queryKey: adminQueryKeys.displayDevices() })
    },
  })
  const revokeMutation = useMutation({
    mutationFn: (device: DisplayDevice) => service.revokeDisplayDevice(classId, device.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminQueryKeys.displayDevices() }),
  })
  return { devices: query.data ?? [], createBindingCode: createBindingCodeMutation.mutateAsync, pollBindingSession: pollBindingSessionMutation.mutateAsync, revokeDevice: revokeMutation.mutateAsync, isLoading: query.isLoading }
}

export function useAdminSeating() {
  const service = useClassroomService()
  const classId = currentClassId()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: adminQueryKeys.seating(), queryFn: () => loadSeating(service, classId), initialData: undefined, staleTime: STALE_TIME })
  const fallback = initialSeating()
  const state = query.data ?? fallback
  const saveMutation = useMutation({
    mutationFn: async (draft: SeatingDraft) => {
      const result = await service.saveSeatLayout(classId, {
        seats: draft.seats.map(({ row, col, studentId, cellType }) => ({ row, col, studentId, cellType })),
      })
      const next = await loadSeating(service, classId)
      return { ...next, nextVersion: result.version }
    },
    onSuccess: (next) => queryClient.setQueryData(adminQueryKeys.seating(), { draft: next.draft, saved: next.saved, versions: next.versions }),
  })
  const restoreMutation = useMutation({
    mutationFn: async (version: SeatLayoutVersion) => {
      const result = await service.restoreSeatLayout(classId, version.id)
      const next = await loadSeating(service, classId)
      return { ...next, nextVersion: result.version }
    },
    onSuccess: (next) => queryClient.setQueryData(adminQueryKeys.seating(), { draft: next.draft, saved: next.saved, versions: next.versions }),
  })
  const updateDraft = (draft: SeatingDraft) => queryClient.setQueryData<SeatingQueryData>(adminQueryKeys.seating(), (old) => ({ ...(old ?? fallback), draft }))
  return {
    ...state.draft,
    savedLayout: state.saved,
    versions: state.versions,
    isDirty: JSON.stringify(state.draft) !== JSON.stringify(state.saved),
    saveLayout: saveMutation.mutateAsync,
    restoreLayout: restoreMutation.mutateAsync,
    updateDraft,
    updateDraftSeats: (seats: Seat[]) => updateDraft({ ...state.draft, seats }),
    isLoading: query.isLoading,
  }
}

export function useAdminNotifications() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: adminQueryKeys.notifications(), queryFn: () => initialNotifications, initialData: initialNotifications, staleTime: STALE_TIME })
  const update = (mutator: (items: AdminNotification[]) => AdminNotification[]) => queryClient.setQueryData(adminQueryKeys.notifications(), mutator(query.data ?? []))
  return {
    notifications: query.data ?? [],
    unreadCount: (query.data ?? []).filter((item) => !item.read).length,
    markAsRead: async (id: string) => update((items) => items.map((item) => item.id === id ? { ...item, read: true } : item)),
    markAllAsRead: async () => update((items) => items.map((item) => ({ ...item, read: true }))),
    deleteNotification: async (id: string) => update((items) => items.filter((item) => item.id !== id)),
    clearReadNotifications: async () => update((items) => items.filter((item) => !item.read)),
    clearAll: async () => update(() => []),
    isLoading: query.isLoading,
  }
}
