import type { IsoDateTime } from "./domain"
import { io, type Socket } from "socket.io-client"
import { getActiveClassId, getDisplaySession, getUserSession } from "./session"
import { reportBackendUnavailable } from "./api-error"

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
    period: "WEEK" | "MONTH"
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
  SCHEDULE_CHANGED: {
    activeTemplateId: string
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

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "")

export class SocketIoRealtimeClient implements ClassRealtimeClient {
  private socket: Socket | undefined
  private status: RealtimeConnectionStatus = "DISCONNECTED"
  private readonly eventListeners = new Set<UntypedEventListener>()
  private readonly statusListeners = new Set<(status: RealtimeConnectionStatus) => void>()

  connect(): void {
    if (typeof window === "undefined") return
    const user = getUserSession()
    const display = getDisplaySession()
    const displayRoute = window.location.pathname === "/display" || window.location.pathname.startsWith("/display/")
    const token = displayRoute ? display?.accessToken : user?.accessToken
    const classId = displayRoute ? display?.classId : getActiveClassId()
    if (!token || !classId) {
      this.disconnect()
      return
    }

    this.disconnect()
    this.setStatus("CONNECTING")
    const socket = io(`${API_ORIGIN}/realtime`, {
      auth: { token, classId },
      transports: ["websocket", "polling"],
      reconnection: true,
    })
    this.socket = socket
    socket.on("connect", () => this.setStatus("CONNECTED"))
    socket.on("disconnect", () => this.setStatus("DISCONNECTED"))
    socket.on("connect_error", () => {
      this.setStatus("DISCONNECTED")
      reportBackendUnavailable("无法连接到后端实时服务，请确认后端服务已启动。")
    })
    socket.onAny((eventName: string, payload: unknown) => {
      if (!isClassEventType(eventName) || !isRealtimeEvent(payload)) return
      for (const listener of this.eventListeners) listener(payload)
    })
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = undefined
    }
    this.setStatus("DISCONNECTED")
  }

  getStatus(): RealtimeConnectionStatus {
    return this.status
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
    for (const listener of this.statusListeners) listener(status)
  }
}

function isClassEventType(value: string): value is ClassEventType {
  return value in {
    SCORE_CHANGED: true,
    SCORE_REVERTED: true,
    RANKING_CHANGED: true,
    SEAT_LAYOUT_CHANGED: true,
    STUDENT_CHANGED: true,
    RANDOM_PICKED: true,
    DISPLAY_CONFIG_CHANGED: true,
    SCHEDULE_CHANGED: true,
  }
}

function isRealtimeEvent(value: unknown): value is ClassRealtimeEvent {
  if (typeof value !== "object" || value === null) return false
  const event = value as Partial<ClassRealtimeEvent>
  return typeof event.id === "string" && typeof event.type === "string" && typeof event.classId === "string" && typeof event.occurredAt === "string" && event.payload !== undefined
}
