"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  classroomQueryKeys,
  type BindDisplayInput,
  type ConsumeInvitationInput,
  type CreateCustomScoreInput,
  type CreateRuleScoreInput,
  type CreateScoreRuleInput,
  type CreateStudentInput,
  type CreateTeacherInput,
  type DeviceTokenInput,
  type LoginInput,
  type PollBindingSessionInput,
  type RefreshInput,
  type SaveSeatLayoutInput,
  type ScoreRecordListQuery,
  type StudentListQuery,
  type UpdateClassroomInput,
  type UpdateScoreRuleInput,
  type UpdateStudentInput,
  type UpdateTeacherInput,
} from "@/lib"

import { useClassroomService } from "./classroom-system-provider"

export function useClassrooms() {
  const service = useClassroomService()
  return useQuery({ queryKey: classroomQueryKeys.all, queryFn: () => service.listClassrooms() })
}

export function useClassroom(classId: string) {
  const service = useClassroomService()
  return useQuery({
    queryKey: classroomQueryKeys.detail(classId),
    queryFn: () => service.getClassroom(classId),
    enabled: classId.length > 0,
  })
}

export function useStudents(classId: string, query: StudentListQuery = {}) {
  const service = useClassroomService()
  return useQuery({
    queryKey: classroomQueryKeys.students(classId, query),
    queryFn: () => service.listStudents(classId, query),
    enabled: classId.length > 0,
  })
}

export function useTeachers(classId: string) {
  const service = useClassroomService()
  return useQuery({
    queryKey: classroomQueryKeys.teachers(classId),
    queryFn: () => service.listTeachers(classId),
    enabled: classId.length > 0,
  })
}

export function useScoreRules(classId: string, enabled?: boolean) {
  const service = useClassroomService()
  return useQuery({
    queryKey: classroomQueryKeys.scoreRules(classId, enabled),
    queryFn: () => service.listScoreRules(classId, enabled),
    enabled: classId.length > 0,
  })
}

export function useScoreRecords(classId: string, query: ScoreRecordListQuery = {}) {
  const service = useClassroomService()
  return useQuery({
    queryKey: classroomQueryKeys.scoreRecords(classId, query),
    queryFn: () => service.listScoreRecords(classId, query),
    enabled: classId.length > 0,
  })
}

export function useSeatLayout(classId: string) {
  const service = useClassroomService()
  return useQuery({
    queryKey: classroomQueryKeys.seatLayout(classId),
    queryFn: () => service.getSeatLayout(classId),
    enabled: classId.length > 0,
  })
}

export function useSeatLayoutVersions(classId: string, page = 1, pageSize = 20) {
  const service = useClassroomService()
  return useQuery({
    queryKey: classroomQueryKeys.seatLayoutVersions(classId, page, pageSize),
    queryFn: () => service.listSeatLayoutVersions(classId, page, pageSize),
    enabled: classId.length > 0,
  })
}

export function useSeatLayoutVersion(classId: string, versionId: string) {
  const service = useClassroomService()
  return useQuery({
    queryKey: classroomQueryKeys.seatLayoutVersion(classId, versionId),
    queryFn: () => service.getSeatLayoutVersion(classId, versionId),
    enabled: classId.length > 0 && versionId.length > 0,
  })
}

export function useWeeklyRanking(classId: string) {
  const service = useClassroomService()
  return useQuery({
    queryKey: classroomQueryKeys.ranking(classId),
    queryFn: () => service.getWeeklyRanking(classId),
    enabled: classId.length > 0,
  })
}

export function useDisplayDevices(classId: string) {
  const service = useClassroomService()
  return useQuery({
    queryKey: classroomQueryKeys.displayDevices(classId),
    queryFn: () => service.listDisplayDevices(classId),
    enabled: classId.length > 0,
  })
}

export function useDisplayBootstrap(deviceId: string) {
  const service = useClassroomService()
  return useQuery({
    queryKey: classroomQueryKeys.displayBootstrap(deviceId),
    queryFn: () => service.getDisplayBootstrap(deviceId),
    enabled: deviceId.length > 0,
  })
}

export function useBindingSessionPolling(
  bindingSessionId: string,
  input: PollBindingSessionInput,
  enabled = true,
) {
  const service = useClassroomService()
  return useQuery({
    queryKey: classroomQueryKeys.bindingSession(bindingSessionId),
    queryFn: () => service.pollBindingSession(bindingSessionId, input),
    enabled: enabled && bindingSessionId.length > 0 && input.nonce.length > 0,
    refetchInterval: (query) => (query.state.data?.status === "READY" ? false : 1_000),
  })
}

export function useUpdateClassroom(classId: string) {
  const service = useClassroomService()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateClassroomInput) => service.updateClassroom(classId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: classroomQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: classroomQueryKeys.detail(classId) })
    },
  })
}

export function useCreateStudent(classId: string) {
  const service = useClassroomService()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStudentInput) => service.createStudent(classId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["classrooms", classId, "students"] }),
  })
}

export function useUpdateStudent(classId: string) {
  const service = useClassroomService()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ studentId, input }: { studentId: string; input: UpdateStudentInput }) =>
      service.updateStudent(classId, studentId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["classrooms", classId, "students"] }),
  })
}

export function useDeactivateStudent(classId: string) {
  const service = useClassroomService()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (studentId: string) => service.deactivateStudent(classId, studentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["classrooms", classId, "students"] })
      void queryClient.invalidateQueries({ queryKey: classroomQueryKeys.seatLayout(classId) })
      void queryClient.invalidateQueries({ queryKey: classroomQueryKeys.ranking(classId) })
    },
  })
}

export function useCreateTeacher(classId: string) {
  const service = useClassroomService()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTeacherInput) => service.createTeacher(classId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: classroomQueryKeys.teachers(classId) }),
  })
}

export function useUpdateTeacher(classId: string) {
  const service = useClassroomService()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ classTeacherId, input }: { classTeacherId: string; input: UpdateTeacherInput }) =>
      service.updateTeacher(classId, classTeacherId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: classroomQueryKeys.teachers(classId) }),
  })
}

export function useCreateTeacherInvitation(classId: string) {
  const service = useClassroomService()
  return useMutation({
    mutationFn: (classTeacherId: string) => service.createTeacherInvitation(classId, classTeacherId),
  })
}

export function useRevokeTeacher(classId: string) {
  const service = useClassroomService()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (classTeacherId: string) => service.revokeTeacher(classId, classTeacherId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: classroomQueryKeys.teachers(classId) }),
  })
}

export function useCreateScoreRule(classId: string) {
  const service = useClassroomService()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateScoreRuleInput) => service.createScoreRule(classId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["classrooms", classId, "score-rules"] }),
  })
}

export function useUpdateScoreRule(classId: string) {
  const service = useClassroomService()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleId, input }: { ruleId: string; input: UpdateScoreRuleInput }) =>
      service.updateScoreRule(classId, ruleId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["classrooms", classId, "score-rules"] }),
  })
}

export function useDisableScoreRule(classId: string) {
  const service = useClassroomService()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: string) => service.disableScoreRule(classId, ruleId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["classrooms", classId, "score-rules"] }),
  })
}

export function useCreateRuleScore(classId: string) {
  const service = useClassroomService()
  return useMutation({ mutationFn: (input: CreateRuleScoreInput) => service.createRuleScore(classId, input) })
}

export function useCreateCustomScore(classId: string) {
  const service = useClassroomService()
  return useMutation({ mutationFn: (input: CreateCustomScoreInput) => service.createCustomScore(classId, input) })
}

export function useRevertScore(classId: string, operatorId?: string) {
  const service = useClassroomService()
  return useMutation({ mutationFn: (recordId: string) => service.revertScore(classId, recordId, operatorId) })
}

export function useSaveSeatLayout(classId: string) {
  const service = useClassroomService()
  return useMutation({ mutationFn: (input: SaveSeatLayoutInput) => service.saveSeatLayout(classId, input) })
}

export function useRestoreSeatLayout(classId: string) {
  const service = useClassroomService()
  return useMutation({ mutationFn: (versionId: string) => service.restoreSeatLayout(classId, versionId) })
}

export function useRandomPick(classId: string) {
  const service = useClassroomService()
  return useMutation({ mutationFn: (excludeStudentIds: string[] = []) => service.randomPick(classId, { excludeStudentIds }) })
}

export function useCreateBindingCode() {
  const service = useClassroomService()
  return useMutation({ mutationFn: () => service.createBindingCode() })
}

export function useBindDisplayDevice(classId: string) {
  const service = useClassroomService()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BindDisplayInput) => service.bindDisplayDevice(classId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: classroomQueryKeys.displayDevices(classId) }),
  })
}

export function useRevokeDisplayDevice(classId: string) {
  const service = useClassroomService()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => service.revokeDisplayDevice(classId, deviceId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: classroomQueryKeys.displayDevices(classId) }),
  })
}

export function useExchangeDeviceCredential() {
  const service = useClassroomService()
  return useMutation({ mutationFn: (input: DeviceTokenInput) => service.exchangeDeviceCredential(input) })
}

export function useLogin() {
  const service = useClassroomService()
  return useMutation({ mutationFn: (input: LoginInput) => service.login(input) })
}

export function useRefreshAuth() {
  const service = useClassroomService()
  return useMutation({ mutationFn: (input: RefreshInput) => service.refresh(input) })
}

export function useConsumeInvitation(token: string) {
  const service = useClassroomService()
  return useMutation({
    mutationFn: (input: ConsumeInvitationInput) => service.consumeInvitation(token, input),
  })
}
