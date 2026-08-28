export interface AdminBindingSession {
  sessionId: string;
  code: string;
  deviceName: string;
  expiresAt: string;
  status: "PENDING" | "READY" | "EXPIRED";
  deviceId?: string;
}

export type DisplayBindResult =
  | { success: true; deviceId: string; credential: string; classroomName: string }
  | { success: false; error: string };

let sequence = 0;
let activeSession: AdminBindingSession | null = null;
const listeners: Array<(session: AdminBindingSession) => void> = [];

function notifyListeners() {
  if (activeSession) {
    const clone = { ...activeSession };
    listeners.forEach((fn) => fn(clone));
  }
}

export const displayBindingMock = {
  createAdminBindingCode(deviceName: string): AdminBindingSession {
    sequence += 1;
    const code = String(583920 + sequence).slice(-6);
    activeSession = {
      sessionId: `session-${sequence}`,
      code,
      deviceName: deviceName.trim() || `教室大屏 ${sequence}`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      status: "PENDING",
    };
    notifyListeners();
    return { ...activeSession };
  },

  submitDisplayCode(code: string): DisplayBindResult {
    if (!activeSession || Date.parse(activeSession.expiresAt) <= Date.now()) {
      return { success: false, error: "绑定码已过期或未生成，请在管理端获取" };
    }
    if (activeSession.status === "READY") {
      return { success: false, error: "该绑定码已被使用，请重新生成" };
    }
    if (activeSession.code !== code.trim()) {
      return { success: false, error: "绑定码错误，请核对管理端 6 位数字" };
    }

    const deviceId = `display-${String(sequence + 1).padStart(3, "0")}`;
    activeSession.status = "READY";
    activeSession.deviceId = deviceId;
    notifyListeners();

    return {
      success: true,
      deviceId,
      credential: `cred-${sequence}-${Date.now()}`,
      classroomName: "三年级二班",
    };
  },

  pollAdminSession(sessionId: string): {
    status: "PENDING" | "READY" | "EXPIRED";
    deviceId?: string;
    deviceName?: string;
  } {
    if (!activeSession || activeSession.sessionId !== sessionId) {
      return { status: "EXPIRED" };
    }
    if (Date.parse(activeSession.expiresAt) <= Date.now()) {
      return { status: "EXPIRED" };
    }
    return {
      status: activeSession.status,
      deviceId: activeSession.deviceId,
      deviceName: activeSession.deviceName,
    };
  },

  getActiveSession(): AdminBindingSession | null {
    if (!activeSession || Date.parse(activeSession.expiresAt) <= Date.now()) {
      return null;
    }
    return { ...activeSession };
  },

  subscribe(listener: (session: AdminBindingSession) => void): () => void {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  },
};
