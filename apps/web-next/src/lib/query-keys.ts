import type { ScoreRecordListQuery, StudentListQuery } from './domain';

export const classroomQueryKeys = {
  all: ['classrooms'] as const,
  detail: (classId: string) => ['classrooms', classId] as const,
  students: (classId: string, query: StudentListQuery = {}) =>
    ['classrooms', classId, 'students', query] as const,
  teachers: (classId: string) => ['classrooms', classId, 'teachers'] as const,
  schedule: (classId: string) => ['classrooms', classId, 'schedule'] as const,
  seatLayout: (classId: string) => ['classrooms', classId, 'seat-layout'] as const,
  seatLayoutVersions: (classId: string, page = 1, pageSize = 20) =>
    ['classrooms', classId, 'seat-layout', 'versions', page, pageSize] as const,
  seatLayoutVersion: (classId: string, versionId: string) =>
    ['classrooms', classId, 'seat-layout', 'versions', versionId] as const,
  scoreRules: (classId: string, enabled?: boolean) =>
    ['classrooms', classId, 'score-rules', enabled] as const,
  scoreRecords: (classId: string, query: ScoreRecordListQuery = {}) =>
    ['classrooms', classId, 'score-records', query] as const,
  ranking: (classId: string) => ['classrooms', classId, 'ranking'] as const,
  scorePeriodCurrent: (classId: string) =>
    ['classrooms', classId, 'score-periods', 'current'] as const,
  scorePeriodSummary: (classId: string, query: object = {}) =>
    ['classrooms', classId, 'score-periods', 'summary', query] as const,
  committee: (classId: string) => ['classrooms', classId, 'committee'] as const,
  displayDevices: (classId: string) => ['classrooms', classId, 'display-devices'] as const,
  displayBootstrap: (deviceId: string) => ['display', deviceId, 'bootstrap'] as const,
  bindingSession: (bindingSessionId: string) =>
    ['display', 'binding-session', bindingSessionId] as const,
};
