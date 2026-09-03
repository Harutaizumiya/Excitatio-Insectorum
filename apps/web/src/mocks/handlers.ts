import { HttpResponse, http, type HttpHandler } from "msw"

import {
  ClassroomServiceError,
  type BindDisplayInput,
  type ClassroomService,
  type ConsumeInvitationInput,
  type CreateCustomScoreInput,
  type CreateScoreEventInput,
  type CreateRuleScoreInput,
  type CreateScoreRuleInput,
  type CreateStudentInput,
  type CreateTeacherInput,
  type DeviceTokenInput,
  type LoginInput,
  type PaginatedEnvelope,
  type PollBindingSessionInput,
  type RandomPickInput,
  type RefreshInput,
  type SaveSeatLayoutInput,
  type SaveClassScheduleInput,
  type UpdateClassroomInput,
  type UpdateScoreRuleInput,
  type UpdateStudentInput,
  type UpdateTeacherInput,
  type UpdateCommitteeInput,
} from "@/lib"

const API_PREFIX = "/api/v1"

function param(value: string | readonly string[] | undefined): string {
  if (typeof value === "string") return value
  return value?.[0] ?? ""
}

async function body<T>(request: Request): Promise<T> {
  return (await request.json()) as T
}

async function optionalBody<T>(request: Request): Promise<T | undefined> {
  try {
    return await body<T>(request)
  } catch {
    return undefined
  }
}

async function envelope<T>(operation: () => Promise<T>): Promise<Response> {
  try {
    return HttpResponse.json({ data: await operation() })
  } catch (error) {
    if (error instanceof ClassroomServiceError) {
      return HttpResponse.json(
        { code: error.code, message: error.message, requestId: "mock-request" },
        { status: error.status },
      )
    }
    throw error
  }
}

async function paginatedEnvelope<T>(
  operation: () => Promise<PaginatedEnvelope<T>>,
): Promise<Response> {
  try {
    return HttpResponse.json(await operation())
  } catch (error) {
    if (error instanceof ClassroomServiceError) {
      return HttpResponse.json(
        { code: error.code, message: error.message, requestId: "mock-request" },
        { status: error.status },
      )
    }
    throw error
  }
}

export function createMockHandlers(service: ClassroomService): HttpHandler[] {
  return [
    http.get(`${API_PREFIX}/classes`, () => envelope(() => service.listClassrooms())),
    http.get(`${API_PREFIX}/classes/:classId`, ({ params }) =>
      envelope(() => service.getClassroom(param(params.classId))),
    ),
    http.patch(`${API_PREFIX}/classes/:classId`, async ({ params, request }) =>
      envelope(async () =>
        service.updateClassroom(
          param(params.classId),
          await body<UpdateClassroomInput>(request),
        ),
      ),
    ),
    http.get(`${API_PREFIX}/classes/:classId/schedule`, ({ params }) =>
      envelope(() => service.getSchedule(param(params.classId))),
    ),
    http.put(`${API_PREFIX}/classes/:classId/schedule`, async ({ params, request }) =>
      envelope(async () => service.saveSchedule(param(params.classId), await body<SaveClassScheduleInput>(request))),
    ),
    http.get(`${API_PREFIX}/classes/:classId/students`, ({ params, request }) => {
      const url = new URL(request.url)
      const status = url.searchParams.get("status")
      return paginatedEnvelope(() =>
        service.listStudents(param(params.classId), {
          status: status === "ACTIVE" || status === "INACTIVE" ? status : undefined,
          keyword: url.searchParams.get("keyword") ?? undefined,
          page: Number(url.searchParams.get("page") ?? 1),
          pageSize: Number(url.searchParams.get("pageSize") ?? 20),
        }),
      )
    }),
    http.post(`${API_PREFIX}/classes/:classId/students`, async ({ params, request }) =>
      envelope(async () =>
        service.createStudent(param(params.classId), await body<CreateStudentInput>(request)),
      ),
    ),
    http.patch(`${API_PREFIX}/classes/:classId/students/:studentId`, async ({ params, request }) =>
      envelope(async () =>
        service.updateStudent(
          param(params.classId),
          param(params.studentId),
          await body<UpdateStudentInput>(request),
        ),
      ),
    ),
    http.post(`${API_PREFIX}/classes/:classId/students/:studentId/deactivate`, ({ params }) =>
      envelope(() => service.deactivateStudent(param(params.classId), param(params.studentId))),
    ),
    http.get(`${API_PREFIX}/classes/:classId/teachers`, ({ params }) =>
      envelope(() => service.listTeachers(param(params.classId))),
    ),
    http.post(`${API_PREFIX}/classes/:classId/teachers`, async ({ params, request }) =>
      envelope(async () =>
        service.createTeacher(param(params.classId), await body<CreateTeacherInput>(request)),
      ),
    ),
    http.patch(
      `${API_PREFIX}/classes/:classId/teachers/:classTeacherId`,
      async ({ params, request }) =>
        envelope(async () =>
          service.updateTeacher(
            param(params.classId),
            param(params.classTeacherId),
            await body<UpdateTeacherInput>(request),
          ),
        ),
    ),
    http.post(
      `${API_PREFIX}/classes/:classId/teachers/:classTeacherId/invitations`,
      ({ params }) =>
        envelope(() =>
          service.createTeacherInvitation(
            param(params.classId),
            param(params.classTeacherId),
          ),
        ),
    ),
    http.post(`${API_PREFIX}/classes/:classId/teachers/:classTeacherId/revoke`, ({ params }) =>
      envelope(() =>
        service.revokeTeacher(param(params.classId), param(params.classTeacherId)),
      ),
    ),
    http.get(`${API_PREFIX}/classes/:classId/seat-layout`, ({ params }) =>
      envelope(() => service.getSeatLayout(param(params.classId))),
    ),
    http.put(`${API_PREFIX}/classes/:classId/seat-layout`, async ({ params, request }) =>
      envelope(async () =>
        service.saveSeatLayout(param(params.classId), await body<SaveSeatLayoutInput>(request)),
      ),
    ),
    http.get(`${API_PREFIX}/classes/:classId/seat-layout/versions`, ({ params, request }) => {
      const url = new URL(request.url)
      return paginatedEnvelope(() =>
        service.listSeatLayoutVersions(
          param(params.classId),
          Number(url.searchParams.get("page") ?? 1),
          Number(url.searchParams.get("pageSize") ?? 20),
        ),
      )
    }),
    http.get(
      `${API_PREFIX}/classes/:classId/seat-layout/versions/:versionId`,
      ({ params }) =>
        envelope(() =>
          service.getSeatLayoutVersion(param(params.classId), param(params.versionId)),
        ),
    ),
    http.post(
      `${API_PREFIX}/classes/:classId/seat-layout/versions/:versionId/restore`,
      ({ params }) =>
        envelope(() =>
          service.restoreSeatLayout(param(params.classId), param(params.versionId)),
        ),
    ),
    http.get(`${API_PREFIX}/classes/:classId/score-rules`, ({ params, request }) => {
      const enabled = new URL(request.url).searchParams.get("enabled")
      return envelope(() =>
        service.listScoreRules(
          param(params.classId),
          enabled === null ? undefined : enabled === "true",
        ),
      )
    }),
    http.post(`${API_PREFIX}/classes/:classId/score-rules`, async ({ params, request }) =>
      envelope(async () =>
        service.createScoreRule(param(params.classId), await body<CreateScoreRuleInput>(request)),
      ),
    ),
    http.patch(
      `${API_PREFIX}/classes/:classId/score-rules/:ruleId`,
      async ({ params, request }) =>
        envelope(async () =>
          service.updateScoreRule(
            param(params.classId),
            param(params.ruleId),
            await body<UpdateScoreRuleInput>(request),
          ),
        ),
    ),
    http.post(`${API_PREFIX}/classes/:classId/score-rules/:ruleId/disable`, ({ params }) =>
      envelope(() => service.disableScoreRule(param(params.classId), param(params.ruleId))),
    ),
    http.get(`${API_PREFIX}/classes/:classId/scores`, ({ params, request }) => {
      const url = new URL(request.url)
      return paginatedEnvelope(() =>
        service.listScoreRecords(param(params.classId), {
          studentId: url.searchParams.get("studentId") ?? undefined,
          operatorId: url.searchParams.get("operatorId") ?? undefined,
          from: url.searchParams.get("from") ?? undefined,
          to: url.searchParams.get("to") ?? undefined,
          page: Number(url.searchParams.get("page") ?? 1),
          pageSize: Number(url.searchParams.get("pageSize") ?? 20),
        }),
      )
    }),
    http.post(`${API_PREFIX}/classes/:classId/scores/rule`, async ({ params, request }) =>
      envelope(async () =>
        service.createRuleScore(param(params.classId), await body<CreateRuleScoreInput>(request)),
      ),
    ),
    http.post(`${API_PREFIX}/classes/:classId/scores/custom`, async ({ params, request }) =>
      envelope(async () =>
        service.createCustomScore(
          param(params.classId),
          await body<CreateCustomScoreInput>(request),
        ),
      ),
    ),
    http.post(`${API_PREFIX}/classes/:classId/score-events`, async ({ params, request }) =>
      envelope(async () => service.createScoreEvent(param(params.classId), await body<CreateScoreEventInput>(request))),
    ),
    http.get(`${API_PREFIX}/classes/:classId/score-periods/current/summary`, ({ params }) =>
      envelope(() => service.getCurrentScorePeriodSummary(param(params.classId))),
    ),
    http.get(`${API_PREFIX}/classes/:classId/score-periods/summary`, ({ params, request }) => {
      const url = new URL(request.url)
      return envelope(() => service.getScorePeriodSummary(param(params.classId), {
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
      }))
    }),
    http.get(`${API_PREFIX}/classes/:classId/committee`, ({ params }) =>
      envelope(() => service.listCommittee(param(params.classId))),
    ),
    http.put(`${API_PREFIX}/classes/:classId/committee`, async ({ params, request }) =>
      envelope(async () => service.updateCommittee(param(params.classId), await body<UpdateCommitteeInput>(request))),
    ),
    http.post(`${API_PREFIX}/classes/:classId/score-periods/settle`, async ({ params, request }) => {
      const input = await optionalBody<{ periodId?: string }>(request)
      return envelope(() => service.settleScorePeriods(param(params.classId), input?.periodId))
    }),
    http.post(`${API_PREFIX}/classes/:classId/scores/:recordId/revert`, ({ params }) =>
      envelope(() => service.revertScore(param(params.classId), param(params.recordId))),
    ),
    http.get(`${API_PREFIX}/classes/:classId/ranking`, ({ params }) =>
      envelope(() => service.getWeeklyRanking(param(params.classId))),
    ),
    http.post(`${API_PREFIX}/classes/:classId/random-pick`, async ({ params, request }) =>
      envelope(async () =>
        service.randomPick(
          param(params.classId),
          await optionalBody<RandomPickInput>(request),
        ),
      ),
    ),
    http.post(`${API_PREFIX}/display/binding-codes`, () =>
      envelope(() => service.createBindingCode()),
    ),
    http.post(
      `${API_PREFIX}/display/binding-sessions/:bindingSessionId/poll`,
      async ({ params, request }) =>
        envelope(async () =>
          service.pollBindingSession(
            param(params.bindingSessionId),
            await body<PollBindingSessionInput>(request),
          ),
        ),
    ),
    http.get(`${API_PREFIX}/classes/:classId/display-devices`, ({ params }) =>
      envelope(() => service.listDisplayDevices(param(params.classId))),
    ),
    http.post(`${API_PREFIX}/classes/:classId/display-devices/bind`, async ({ params, request }) =>
      envelope(async () =>
        service.bindDisplayDevice(param(params.classId), await body<BindDisplayInput>(request)),
      ),
    ),
    http.post(
      `${API_PREFIX}/classes/:classId/display-devices/:deviceId/revoke`,
      ({ params }) =>
        envelope(() =>
          service.revokeDisplayDevice(param(params.classId), param(params.deviceId)),
        ),
    ),
    http.post(`${API_PREFIX}/display/auth/token`, async ({ request }) =>
      envelope(async () =>
        service.exchangeDeviceCredential(await body<DeviceTokenInput>(request)),
      ),
    ),
    http.get(`${API_PREFIX}/display/bootstrap`, ({ request }) => {
      const deviceId = request.headers.get("x-mock-device-id") ?? "display-main-board"
      return envelope(() => service.getDisplayBootstrap(deviceId))
    }),
    http.post(`${API_PREFIX}/auth/login`, async ({ request }) =>
      envelope(async () => service.login(await body<LoginInput>(request))),
    ),
    http.post(`${API_PREFIX}/auth/refresh`, async ({ request }) =>
      envelope(async () => service.refresh(await body<RefreshInput>(request))),
    ),
    http.post(`${API_PREFIX}/auth/invitations/:token/consume`, async ({ params, request }) =>
      envelope(async () =>
        service.consumeInvitation(
          param(params.token),
          await body<ConsumeInvitationInput>(request),
        ),
      ),
    ),
  ]
}
