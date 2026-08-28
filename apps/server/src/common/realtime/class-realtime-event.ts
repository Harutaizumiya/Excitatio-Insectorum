export const CLASS_REALTIME_PUBLISHER = Symbol('CLASS_REALTIME_PUBLISHER');

export enum ClassEventType {
  SCORE_CHANGED = 'SCORE_CHANGED',
  SCORE_REVERTED = 'SCORE_REVERTED',
  RANKING_CHANGED = 'RANKING_CHANGED',
  SEAT_LAYOUT_CHANGED = 'SEAT_LAYOUT_CHANGED',
  STUDENT_CHANGED = 'STUDENT_CHANGED',
  RANDOM_PICKED = 'RANDOM_PICKED',
  DISPLAY_CONFIG_CHANGED = 'DISPLAY_CONFIG_CHANGED',
}

export interface ClassRealtimeEvent<TPayload = unknown> {
  id: string;
  type: ClassEventType;
  classId: string;
  occurredAt: string;
  payload: TPayload;
}

export interface ClassRealtimePublisher {
  publishClassEvent<TPayload>(
    classId: string,
    event: ClassRealtimeEvent<TPayload>,
  ): void | Promise<void>;
}

export const classRoomName = (classId: string): string => `class:${classId}`;
