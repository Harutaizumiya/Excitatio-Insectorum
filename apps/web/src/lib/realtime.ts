import type { IsoDateTime } from "./domain"

export interface RealtimeEventPayloads {
  SCORE_CHANGED: {
    studentId: string
    direction: "INCREASE" | "DECREASE"
  }
  SCORE_REVERTED: {
    studentId: string
    recordId: string
  }
  RANKING_CHANGED: {
    period: "WEEK"
  }
  SEAT_LAYOUT_CHANGED: {
    version: number
  }
  STUDENT_CHANGED: {
    studentId: string
    action: "CREATED" | "UPDATED" | "DEACTIVATED"
  }
  RANDOM_PICKED: {
    studentId: string
    name: string
    displayDurationMs: 8000
  }
  DISPLAY_CONFIG_CHANGED: {
    mode: "SEAT_AND_RANKING" | "SEAT_ONLY" | "RANKING_ONLY"
  }
}

export type ClassEventType = keyof RealtimeEventPayloads

export interface ClassRealtimeEvent<TType extends ClassEventType = ClassEventType> {
  id: string
  type: TType
  classId: string
  occurredAt: IsoDateTime
  payload: RealtimeEventPayloads[TType]
}

export type RealtimeConnectionStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED"
export type RealtimeUnsubscribe = () => void

export interface ClassRealtimeClient {
  connect(): void
  disconnect(): void
  getStatus(): RealtimeConnectionStatus
  subscribe<TType extends ClassEventType>(
    type: TType,
    classId: string | undefined,
    handler: (event: ClassRealtimeEvent<TType>) => void,
  ): RealtimeUnsubscribe
  subscribeStatus(handler: (status: RealtimeConnectionStatus) => void): RealtimeUnsubscribe
}

export interface ClassRealtimePublisher {
  publish<TType extends ClassEventType>(event: ClassRealtimeEvent<TType>): void
}

type UntypedEventListener = (event: ClassRealtimeEvent) => void

export class InMemoryRealtimeBus implements ClassRealtimeClient, ClassRealtimePublisher {
  private readonly eventListeners = new Set<UntypedEventListener>()
  private readonly statusListeners = new Set<(status: RealtimeConnectionStatus) => void>()
  private status: RealtimeConnectionStatus = "DISCONNECTED"

  connect(): void {
    this.setStatus("CONNECTING")
    this.setStatus("CONNECTED")
  }

  disconnect(): void {
    this.setStatus("DISCONNECTED")
  }

  getStatus(): RealtimeConnectionStatus {
    return this.status
  }

  publish<TType extends ClassEventType>(event: ClassRealtimeEvent<TType>): void {
    for (const listener of this.eventListeners) {
      listener(event)
    }
  }

  subscribe<TType extends ClassEventType>(
    type: TType,
    classId: string | undefined,
    handler: (event: ClassRealtimeEvent<TType>) => void,
  ): RealtimeUnsubscribe {
    const listener: UntypedEventListener = (event) => {
      if (event.type === type && (classId === undefined || event.classId === classId)) {
        handler(event as ClassRealtimeEvent<TType>)
      }
    }
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  subscribeStatus(handler: (status: RealtimeConnectionStatus) => void): RealtimeUnsubscribe {
    this.statusListeners.add(handler)
    handler(this.status)
    return () => this.statusListeners.delete(handler)
  }

  private setStatus(status: RealtimeConnectionStatus): void {
    if (this.status === status) return
    this.status = status
    for (const listener of this.statusListeners) {
      listener(status)
    }
  }
}
