import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useClassroomService } from '@/components/providers/classroom-system-provider';
import { getActiveClassId } from '@/lib/session';
import type { CreateFeedbackInput, FeedbackListQuery, UpdateFeedbackInput } from './feedback-types';

function currentClassId(): string {
  return getActiveClassId() ?? '';
}

export const feedbackQueryKeys = {
  all: ['admin', 'feedback'] as const,
  list: (classId: string, query: FeedbackListQuery) =>
    [
      'admin',
      'feedback',
      classId,
      'list',
      query.status ?? 'ALL',
      query.type ?? 'ALL',
      query.page ?? 1,
      query.pageSize ?? 20,
    ] as const,
  detail: (classId: string, feedbackId: string) =>
    ['admin', 'feedback', classId, 'detail', feedbackId] as const,
};

export const analyticsQueryKeys = {
  all: ['admin', 'analytics'] as const,
  summary: (classId: string, range?: { from?: string; to?: string }) =>
    ['admin', 'analytics', classId, 'summary', range?.from ?? null, range?.to ?? null] as const,
};

export function useAdminFeedbackList(query: FeedbackListQuery) {
  const service = useClassroomService();
  const classId = currentClassId();
  return useQuery({
    queryKey: feedbackQueryKeys.list(classId, query),
    queryFn: () => service.listFeedback(classId, query),
    enabled: classId.length > 0,
    staleTime: 30_000,
  });
}

export function useAdminFeedbackDetail(feedbackId: string | null) {
  const service = useClassroomService();
  const classId = currentClassId();
  return useQuery({
    queryKey: feedbackQueryKeys.detail(classId, feedbackId ?? ''),
    queryFn: () => service.getFeedback(classId, feedbackId ?? ''),
    enabled: classId.length > 0 && Boolean(feedbackId),
    staleTime: 0,
  });
}

export function useCreateFeedback() {
  const service = useClassroomService();
  const classId = currentClassId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFeedbackInput) => service.createFeedback(classId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedbackQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: analyticsQueryKeys.all });
    },
  });
}

export function useUpdateFeedback() {
  const service = useClassroomService();
  const classId = currentClassId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ feedbackId, input }: { feedbackId: string; input: UpdateFeedbackInput }) =>
      service.updateFeedback(classId, feedbackId, input),
    onSuccess: (feedback) => {
      queryClient.setQueryData(feedbackQueryKeys.detail(classId, feedback.id), feedback);
      void queryClient.invalidateQueries({ queryKey: feedbackQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: analyticsQueryKeys.all });
    },
  });
}

export function useUsageAnalytics(range?: { from?: string; to?: string }) {
  const service = useClassroomService();
  const classId = currentClassId();
  return useQuery({
    queryKey: analyticsQueryKeys.summary(classId, range),
    queryFn: () => service.getUsageAnalytics(classId, range),
    enabled: classId.length > 0,
    staleTime: 60_000,
  });
}
