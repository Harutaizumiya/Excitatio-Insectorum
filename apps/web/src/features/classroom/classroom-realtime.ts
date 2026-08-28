export type ClassRealtimeEvent =
  | {
      id: string
      type: "RANDOM_PICKED"
      classId: string
      occurredAt: string
      payload: { studentId: string; name: string; displayDurationMs: number }
    }
  | {
      id: string
      type: "SCORE_CHANGED"
      classId: string
      occurredAt: string
      payload: { studentId: string; direction: "INCREASE" | "DECREASE" }
    }
  | {
      id: string
      type: "SCORE_REVERTED"
      classId: string
      occurredAt: string
      payload: { studentId: string; recordId: string }
    }
  | {
      id: string
      type: "RANKING_CHANGED"
      classId: string
      occurredAt: string
      payload: { period: "WEEK" }
    }
  | {
      id: string
      type: "SEAT_LAYOUT_CHANGED"
      classId: string
      occurredAt: string
      payload: { version: number }
    }
  | {
      id: string
      type: "STUDENT_CHANGED"
      classId: string
      occurredAt: string
      payload: {
        studentId: string
        action: "CREATED" | "UPDATED" | "DEACTIVATED"
      }
    }

const listeners = new Set<(event: ClassRealtimeEvent) => void>()
const channelName = "classroom-realtime:v1"

let broadcastChannel: BroadcastChannel | null = null

function notify(event: ClassRealtimeEvent): void {
  listeners.forEach((listener) => listener(event))
}

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return null
  }

  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(channelName)
    broadcastChannel.addEventListener(
      "message",
      (message: MessageEvent<ClassRealtimeEvent>) => notify(message.data),
    )
  }

  return broadcastChannel
}

export const classroomRealtime = {
  subscribe(listener: (event: ClassRealtimeEvent) => void): () => void {
    getBroadcastChannel()
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  publish(event: ClassRealtimeEvent): void {
    notify(event)
    getBroadcastChannel()?.postMessage(event)
  },
}
