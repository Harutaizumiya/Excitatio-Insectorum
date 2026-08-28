"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  classroom,
  cloneSeats,
  initialDevices,
  initialNotifications,
  initialRecords,
  initialRules,
  initialSeats,
  initialStudents,
  initialTeachers,
  initialVersions,
  type AdminNotification,
  type DisplayDevice,
  type ScoreRecord,
  type ScoreRule,
  type Seat,
  type SeatLayoutVersion,
  type Student,
  type Teacher,
  type TeacherStatus,
} from "./admin-data";

export const adminQueryKeys = {
  all: ["admin"] as const,
  students: () => ["admin", "students"] as const,
  teachers: () => ["admin", "teachers"] as const,
  scoreRules: () => ["admin", "score-rules"] as const,
  scoreRecords: () => ["admin", "score-records"] as const,
  displayDevices: () => ["admin", "display-devices"] as const,
  seating: () => ["admin", "seating"] as const,
  notifications: () => ["admin", "notifications"] as const,
};

const STALE_TIME = 10 * 60 * 1000; // 10 minutes cache
export interface SeatingDraft {
  gridRows: number;
  gridCols: number;
  seats: Seat[];
}

type SeatingQueryData = { draft: SeatingDraft; saved: SeatingDraft; versions: SeatLayoutVersion[] };

const createInitialDraft = (): SeatingDraft => ({
  gridRows: classroom.gridRows,
  gridCols: classroom.gridCols,
  seats: cloneSeats(initialSeats),
});

// 1. Students Query & Mutations
export function useAdminStudents() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminQueryKeys.students(),
    queryFn: () => initialStudents,
    initialData: initialStudents,
    staleTime: STALE_TIME,
  });

  const saveStudentMutation = useMutation({
    mutationFn: async ({
      editingStudent,
      values,
    }: {
      editingStudent: Student | null;
      values: { name: string; studentNo: string };
    }) => {
      const current = queryClient.getQueryData<Student[]>(adminQueryKeys.students()) ?? initialStudents;
      if (editingStudent) {
        return current.map((student) =>
          student.id === editingStudent.id
            ? { ...student, ...values, updatedAt: "2026-08-26 10:18" }
            : student
        );
      }
      const newStudent: Student = {
        id: `stu-${String(current.length + 1).padStart(3, "0")}`,
        name: values.name,
        studentNo: values.studentNo,
        status: "ACTIVE",
        seat: null,
        updatedAt: "2026-08-26 10:18",
        createdAt: "2026-08-26",
      };
      return [...current, newStudent];
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.students(), updated);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (student: Student) => {
      const current = queryClient.getQueryData<Student[]>(adminQueryKeys.students()) ?? initialStudents;
      return current.map((item) =>
        item.id === student.id
          ? { ...item, status: "INACTIVE" as const, seat: null, updatedAt: "2026-08-26 10:20" }
          : item
      );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.students(), updated);
    },
  });

  return {
    students: query.data,
    saveStudent: saveStudentMutation.mutateAsync,
    deactivateStudent: deactivateMutation.mutateAsync,
    isLoading: query.isLoading,
  };
}

// 2. Teachers Query & Mutations
export function useAdminTeachers() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminQueryKeys.teachers(),
    queryFn: () => initialTeachers,
    initialData: initialTeachers,
    staleTime: STALE_TIME,
  });

  const createTeacherMutation = useMutation({
    mutationFn: async (values: { name: string; subject: string }) => {
      const current = queryClient.getQueryData<Teacher[]>(adminQueryKeys.teachers()) ?? initialTeachers;
      const teacher: Teacher = {
        id: `teacher-${String(current.length + 1).padStart(3, "0")}`,
        name: values.name,
        subject: values.subject,
        status: "PENDING",
        invitationUrl: null,
        invitationExpiresAt: null,
        lastActiveAt: null,
      };
      const url = `https://classroom.example/invite/${teacher.id}-${Math.random().toString(36).slice(2, 8)}`;
      const invitedTeacher: Teacher = {
        ...teacher,
        invitationUrl: url,
        invitationExpiresAt: "2026-08-30 23:59",
      };
      return { updatedList: [...current, invitedTeacher], invitedTeacher, url };
    },
    onSuccess: ({ updatedList }) => {
      queryClient.setQueryData(adminQueryKeys.teachers(), updatedList);
    },
  });

  const generateInvitationMutation = useMutation({
    mutationFn: async (teacherId: string) => {
      const current = queryClient.getQueryData<Teacher[]>(adminQueryKeys.teachers()) ?? initialTeachers;
      const teacher = current.find((item) => item.id === teacherId);
      if (!teacher) throw new Error("Teacher not found");
      const url = `https://classroom.example/invite/${teacherId}-${Math.random().toString(36).slice(2, 8)}`;
      const updated: Teacher = {
        ...teacher,
        status: "PENDING" as const,
        invitationUrl: url,
        invitationExpiresAt: "2026-08-30 23:59",
      };
      const updatedList = current.map((item) => (item.id === teacherId ? updated : item));
      return { updatedList, updatedTeacher: updated, url };
    },
    onSuccess: ({ updatedList }) => {
      queryClient.setQueryData(adminQueryKeys.teachers(), updatedList);
    },
  });

  const setTeacherStatusMutation = useMutation({
    mutationFn: async ({ teacherId, status }: { teacherId: string; status: TeacherStatus }) => {
      const current = queryClient.getQueryData<Teacher[]>(adminQueryKeys.teachers()) ?? initialTeachers;
      return current.map((item) =>
        item.id === teacherId
          ? {
              ...item,
              status,
              invitationUrl: status === "DISABLED" ? null : item.invitationUrl,
              invitationExpiresAt: status === "DISABLED" ? null : item.invitationExpiresAt,
            }
          : item
      );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.teachers(), updated);
    },
  });

  const deleteTeacherMutation = useMutation({
    mutationFn: async (teacherId: string) => {
      const current = queryClient.getQueryData<Teacher[]>(adminQueryKeys.teachers()) ?? initialTeachers;
      return current.filter((item) => item.id !== teacherId);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.teachers(), updated);
    },
  });

  return {
    teachers: query.data,
    createTeacher: createTeacherMutation.mutateAsync,
    generateInvitation: generateInvitationMutation.mutateAsync,
    setTeacherStatus: setTeacherStatusMutation.mutateAsync,
    deleteTeacher: deleteTeacherMutation.mutateAsync,
    isLoading: query.isLoading,
  };
}

// 3. Score Rules Query & Mutations
export function useAdminScoreRules() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminQueryKeys.scoreRules(),
    queryFn: () => initialRules,
    initialData: initialRules,
    staleTime: STALE_TIME,
  });

  const saveRuleMutation = useMutation({
    mutationFn: async ({
      editing,
      values,
    }: {
      editing: ScoreRule | null;
      values: { name: string; group?: string; delta?: number; description?: string };
    }) => {
      const current = queryClient.getQueryData<ScoreRule[]>(adminQueryKeys.scoreRules()) ?? initialRules;
      const delta = values.delta ?? 0;
      const group = values.group?.trim() || "课堂表现";
      if (editing) {
        return current.map((rule) =>
          rule.id === editing.id
            ? {
                ...rule,
                name: values.name,
                group,
                delta,
                description: values.description ?? "",
                updatedAt: "2026-08-28 14:50",
              }
            : rule
        );
      }
      const newRule: ScoreRule = {
        id: `rule-${String(current.length + 1).padStart(3, "0")}`,
        name: values.name,
        group,
        delta,
        description: values.description ?? "",
        enabled: true,
        updatedAt: "2026-08-28 14:50",
      };
      return [...current, newRule];
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.scoreRules(), updated);
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async (rule: ScoreRule) => {
      const current = queryClient.getQueryData<ScoreRule[]>(adminQueryKeys.scoreRules()) ?? initialRules;
      return current.map((item) =>
        item.id === rule.id
          ? { ...item, enabled: !item.enabled, updatedAt: "2026-08-26 10:21" }
          : item
      );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.scoreRules(), updated);
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (rule: ScoreRule) => {
      const current = queryClient.getQueryData<ScoreRule[]>(adminQueryKeys.scoreRules()) ?? initialRules;
      return current.filter((item) => item.id !== rule.id);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.scoreRules(), updated);
    },
  });

  return {
    rules: query.data,
    saveRule: saveRuleMutation.mutateAsync,
    toggleRule: toggleRuleMutation.mutateAsync,
    deleteRule: deleteRuleMutation.mutateAsync,
    isLoading: query.isLoading,
  };
}

// 4. Score Records Query & Mutations
export function useAdminScoreRecords() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminQueryKeys.scoreRecords(),
    queryFn: () => initialRecords,
    initialData: initialRecords,
    staleTime: STALE_TIME,
  });

  const revertRecordMutation = useMutation({
    mutationFn: async (record: ScoreRecord) => {
      const current = queryClient.getQueryData<ScoreRecord[]>(adminQueryKeys.scoreRecords()) ?? initialRecords;
      return current.map((item) => (item.id === record.id ? { ...item, reverted: true } : item));
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.scoreRecords(), updated);
    },
  });

  return {
    records: query.data,
    revertRecord: revertRecordMutation.mutateAsync,
    isLoading: query.isLoading,
  };
}

// 5. Display Devices Query & Mutations
export function useAdminDisplayDevices() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminQueryKeys.displayDevices(),
    queryFn: () => initialDevices,
    initialData: initialDevices,
    staleTime: STALE_TIME,
  });

  const bindDeviceMutation = useMutation({
    mutationFn: async (name: string) => {
      const current = queryClient.getQueryData<DisplayDevice[]>(adminQueryKeys.displayDevices()) ?? initialDevices;
      const newDevice: DisplayDevice = {
        id: `display-${String(current.length + 1).padStart(3, "0")}`,
        name: name.trim(),
        status: "ONLINE",
        lastSeenAt: "2026-08-26 10:22:00",
        boundAt: "2026-08-26 10:22:00",
      };
      return [...current, newDevice];
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.displayDevices(), updated);
    },
  });

  const revokeDeviceMutation = useMutation({
    mutationFn: async (device: DisplayDevice) => {
      const current = queryClient.getQueryData<DisplayDevice[]>(adminQueryKeys.displayDevices()) ?? initialDevices;
      return current.filter((item) => item.id !== device.id);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.displayDevices(), updated);
    },
  });

  return {
    devices: query.data,
    bindDevice: bindDeviceMutation.mutateAsync,
    revokeDevice: revokeDeviceMutation.mutateAsync,
    isLoading: query.isLoading,
  };
}

// 6. Seating Layout Query & Mutations
export function useAdminSeating() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminQueryKeys.seating(),
    queryFn: () => ({
      draft: createInitialDraft(),
      saved: createInitialDraft(),
      versions: initialVersions,
    }),
    initialData: {
      draft: createInitialDraft(),
      saved: createInitialDraft(),
      versions: initialVersions,
    },
    staleTime: STALE_TIME,
  });

  const saveLayoutMutation = useMutation({
    mutationFn: async (draft: SeatingDraft) => {
      const current = queryClient.getQueryData<SeatingQueryData>(adminQueryKeys.seating()) ?? {
        draft: createInitialDraft(), saved: createInitialDraft(), versions: initialVersions,
      };

      const nextVersion = Math.max(...current.versions.map((version) => version.version), 0) + 1;
      const next: SeatLayoutVersion = {
        id: `layout-v${nextVersion}`,
        version: nextVersion,
        createdAt: "2026-08-26 10:25",
        createdBy: classroom.teacherName,
        gridRows: draft.gridRows,
        gridCols: draft.gridCols,
        seats: cloneSeats(draft.seats),
        sourceVersionId: null,
      };

      return {
        draft: { ...draft, seats: cloneSeats(draft.seats) },
        saved: { ...draft, seats: cloneSeats(draft.seats) },
        versions: [next, ...current.versions],
        nextVersion,
      };
    },
    onSuccess: (result) => {
      queryClient.setQueryData(adminQueryKeys.seating(), {
        draft: result.draft,
        saved: result.saved,
        versions: result.versions,
      });
    },
  });

  const restoreLayoutMutation = useMutation({
    mutationFn: async (version: SeatLayoutVersion) => {
      const current = queryClient.getQueryData<SeatingQueryData>(adminQueryKeys.seating()) ?? {
        draft: createInitialDraft(), saved: createInitialDraft(), versions: initialVersions,
      };

      const restored = cloneSeats(version.seats);
      const nextVersion = Math.max(...current.versions.map((item) => item.version), 0) + 1;
      const next: SeatLayoutVersion = {
        id: `layout-v${nextVersion}`,
        version: nextVersion,
        createdAt: "2026-08-26 10:27",
        createdBy: classroom.teacherName,
        gridRows: version.gridRows,
        gridCols: version.gridCols,
        seats: restored,
        sourceVersionId: version.id,
      };

      return {
        draft: { gridRows: version.gridRows, gridCols: version.gridCols, seats: restored },
        saved: { gridRows: version.gridRows, gridCols: version.gridCols, seats: cloneSeats(restored) },
        versions: [next, ...current.versions],
        nextVersion,
      };
    },
    onSuccess: (result) => {
      queryClient.setQueryData(adminQueryKeys.seating(), {
        draft: result.draft,
        saved: result.saved,
        versions: result.versions,
      });
    },
  });

  const updateDraft = (draft: SeatingDraft) => {
    queryClient.setQueryData<SeatingQueryData>(adminQueryKeys.seating(), (old) => ({
      ...(old ?? { draft: createInitialDraft(), saved: createInitialDraft(), versions: initialVersions }),
      draft,
    }));
  };

  const updateDraftSeats = (seats: Seat[]) => updateDraft({ ...query.data.draft, seats });

  const isDirty =
    JSON.stringify(query.data.draft) !== JSON.stringify(query.data.saved);

  return {
    ...query.data.draft,
    savedLayout: query.data.saved,
    versions: query.data.versions,
    isDirty,
    saveLayout: saveLayoutMutation.mutateAsync,
    restoreLayout: restoreLayoutMutation.mutateAsync,
    updateDraft,
    updateDraftSeats,
    isLoading: query.isLoading,
  };
}

// 7. Notifications Query & Mutations
export function useAdminNotifications() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminQueryKeys.notifications(),
    queryFn: () => initialNotifications,
    initialData: initialNotifications,
    staleTime: STALE_TIME,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const current = queryClient.getQueryData<AdminNotification[]>(adminQueryKeys.notifications()) ?? initialNotifications;
      return current.map((item) => (item.id === id ? { ...item, read: true } : item));
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.notifications(), updated);
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const current = queryClient.getQueryData<AdminNotification[]>(adminQueryKeys.notifications()) ?? initialNotifications;
      return current.map((item) => ({ ...item, read: true }));
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.notifications(), updated);
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      const current = queryClient.getQueryData<AdminNotification[]>(adminQueryKeys.notifications()) ?? initialNotifications;
      return current.filter((item) => item.id !== id);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.notifications(), updated);
    },
  });

  const clearReadNotificationsMutation = useMutation({
    mutationFn: async () => {
      const current = queryClient.getQueryData<AdminNotification[]>(adminQueryKeys.notifications()) ?? initialNotifications;
      return current.filter((item) => !item.read);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.notifications(), updated);
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      return [];
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminQueryKeys.notifications(), updated);
    },
  });

  const notifications = query.data ?? [];
  const unreadCount = notifications.filter((item) => !item.read).length;

  return {
    notifications,
    unreadCount,
    markAsRead: markAsReadMutation.mutateAsync,
    markAllAsRead: markAllAsReadMutation.mutateAsync,
    deleteNotification: deleteNotificationMutation.mutateAsync,
    clearReadNotifications: clearReadNotificationsMutation.mutateAsync,
    clearAll: clearAllMutation.mutateAsync,
    isLoading: query.isLoading,
  };
}
