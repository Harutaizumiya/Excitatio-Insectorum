export enum ClassEventType {
  SCORE_CHANGED = 'SCORE_CHANGED',
  SCORE_REVERTED = 'SCORE_REVERTED',
  RANKING_CHANGED = 'RANKING_CHANGED',
  SEAT_LAYOUT_CHANGED = 'SEAT_LAYOUT_CHANGED',
  STUDENT_CHANGED = 'STUDENT_CHANGED',
  RANDOM_PICKED = 'RANDOM_PICKED',
  DISPLAY_CONFIG_CHANGED = 'DISPLAY_CONFIG_CHANGED',
  SCHEDULE_CHANGED = 'SCHEDULE_CHANGED',
  TEACHER_CONNECTED = 'TEACHER_CONNECTED',
  ANNOUNCEMENT_CHANGED = 'ANNOUNCEMENT_CHANGED',
}

export interface ClassRealtimeEvent<TPayload = unknown> {
  id: string;
  type: ClassEventType;
  classId: string;
  occurredAt: string;
  payload: TPayload;
}

export const classRoomName = (classId: string): string => `class:${classId}`;
