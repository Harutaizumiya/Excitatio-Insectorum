import type {
  CreateFeedbackInput as ApiCreateFeedbackInput,
  FeedbackCreateResult,
  FeedbackDetail as ApiFeedbackDetail,
  FeedbackListItem as ApiFeedbackListItem,
  FeedbackListQuery as ApiFeedbackListQuery,
  FeedbackListResult as ApiFeedbackListResult,
  FeedbackStatus as ApiFeedbackStatus,
  FeedbackType as ApiFeedbackType,
  UpdateFeedbackInput as ApiUpdateFeedbackInput,
  UsageAnalyticsSummary as ApiUsageAnalyticsSummary,
  UsageClientType,
} from '@/lib';

export type FeedbackType = ApiFeedbackType;
export type FeedbackStatus = ApiFeedbackStatus;
export type FeedbackClientType = UsageClientType;
export type FeedbackListItem = ApiFeedbackListItem;
export type FeedbackDetail = ApiFeedbackDetail;
export type FeedbackListQuery = ApiFeedbackListQuery;
export type FeedbackListResult = ApiFeedbackListResult;
export type CreateFeedbackInput = ApiCreateFeedbackInput;
export type CreateFeedbackResult = FeedbackCreateResult;
export type UpdateFeedbackInput = ApiUpdateFeedbackInput;
export type UsageAnalyticsSummary = ApiUsageAnalyticsSummary;

export const feedbackTypeLabels: Record<FeedbackType, string> = {
  BUG: '功能异常',
  DIFFICULTY: '操作困难',
  DATA_ISSUE: '数据问题',
  FEATURE_REQUEST: '功能建议',
  OTHER: '其他',
};

export const feedbackStatusLabels: Record<FeedbackStatus, string> = {
  PENDING: '待处理',
  IN_PROGRESS: '处理中',
  RESOLVED: '已解决',
  CLOSED: '已关闭',
};

export const feedbackClientLabels: Record<FeedbackClientType, string> = {
  DISPLAY: '大屏',
  ADMIN_WEB: '班主任后台',
  TEACHER_MOBILE: '教师端',
  OTHER: '其他',
};
