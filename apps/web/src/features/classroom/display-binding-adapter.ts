export interface DisplayBindingSession {
  code: string
  expiresAt: string
  bindingSessionId: string
  nonce: string
}

export type DisplayBindingPoll =
  | { status: "PENDING" }
  | { status: "EXPIRED" }
  | { status: "READY"; deviceId: string; credential: string }

let sequence = 0
let activeSession: (DisplayBindingSession & { status: "PENDING" | "READY"; claimed: boolean }) | null = null

export const displayBindingMock = {
  createSession(): DisplayBindingSession {
    sequence += 1
    const code = String(583920 + sequence).slice(-6)
    activeSession = {
      code,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      bindingSessionId: `binding-session-${sequence}`,
      nonce: `nonce-${sequence}-${"display-binding-nonce".repeat(3)}`,
      status: "PENDING",
      claimed: false,
    }
    return { ...activeSession }
  },

  simulateHeadTeacherBind(): void {
    if (!activeSession || Date.parse(activeSession.expiresAt) <= Date.now()) return
    activeSession.status = "READY"
  },

  poll(sessionId: string, nonce: string): DisplayBindingPoll {
    if (!activeSession || activeSession.bindingSessionId !== sessionId || activeSession.nonce !== nonce) return { status: "EXPIRED" }
    if (Date.parse(activeSession.expiresAt) <= Date.now()) return { status: "EXPIRED" }
    if (activeSession.status === "PENDING") return { status: "PENDING" }
    if (activeSession.claimed) return { status: "READY", deviceId: "display-device-1", credential: "claimed" }
    activeSession.claimed = true
    return { status: "READY", deviceId: "display-device-1", credential: `credential-${sequence}` }
  },
}

