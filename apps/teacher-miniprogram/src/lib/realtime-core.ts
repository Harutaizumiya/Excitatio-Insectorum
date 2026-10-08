export type RealtimeConnectionStatus =
  'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'AUTH_REQUIRED';

export interface ClassRealtimeEvent<TPayload = unknown> {
  id: string;
  type: string;
  classId: string;
  occurredAt: string;
  payload: TPayload;
}

export interface SocketMessageEvent {
  data: string | ArrayBuffer;
}

export interface SocketTask {
  onOpen(handler: () => void): void;
  onMessage(handler: (event: SocketMessageEvent) => void): void;
  onError(handler: () => void): void;
  onClose(handler: () => void): void;
  send(options: { data: string }): void;
  close(): void;
}

export interface RealtimeDependencies {
  createSocket(url: string): SocketTask | Promise<SocketTask>;
  getUrl(): string;
  getAuth(): { token: string; classId: string } | null;
  schedule(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  cancel(timer: ReturnType<typeof setTimeout>): void;
}

export class RealtimeLifecycleController {
  private foreground = false;
  private classId: string | null = null;

  constructor(
    private readonly connectForClass: (classId: string) => void,
    private readonly disconnectSocket: () => void,
  ) {}

  setClass(classId: string | null): void {
    if (this.classId === classId) return;
    this.classId = classId;
    if (this.foreground) this.sync();
  }

  show(classId: string | null = this.classId): void {
    this.foreground = true;
    this.classId = classId;
    this.sync();
  }

  hide(): void {
    if (!this.foreground) return;
    this.foreground = false;
    this.disconnectSocket();
  }

  dispose(): void {
    if (this.foreground) this.disconnectSocket();
    this.foreground = false;
    this.classId = null;
  }

  private sync(): void {
    if (!this.classId) {
      this.disconnectSocket();
      return;
    }
    this.connectForClass(this.classId);
  }
}

type EventHandler = (event: ClassRealtimeEvent) => void;
type StatusHandler = (status: RealtimeConnectionStatus) => void;

export class SocketIoRealtimeClient {
  private running = false;
  private authRejected = false;
  private socket: SocketTask | null = null;
  private opening = false;
  private socketGeneration = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private status: RealtimeConnectionStatus = 'DISCONNECTED';
  private readonly eventListeners = new Map<string, Set<EventHandler>>();
  private readonly statusListeners = new Set<StatusHandler>();
  private readonly connectedListeners = new Set<() => void>();
  private readonly seenEventIds = new Set<string>();

  constructor(private readonly dependencies: RealtimeDependencies) {}

  connect(): void {
    this.running = true;
    if (this.authRejected) {
      const previous = this.socket;
      this.socket = null;
      this.opening = false;
      this.socketGeneration += 1;
      previous?.close();
    }
    this.authRejected = false;
    this.reconnectAttempt = 0;
    this.open();
  }

  disconnect(): void {
    this.running = false;
    this.authRejected = false;
    if (this.reconnectTimer !== null) this.dependencies.cancel(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socketGeneration += 1;
    this.opening = false;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.setStatus('DISCONNECTED');
  }

  getStatus(): RealtimeConnectionStatus {
    return this.status;
  }

  subscribe<T extends ClassRealtimeEvent>(type: string, handler: (event: T) => void): () => void {
    const listeners = this.eventListeners.get(type) ?? new Set<EventHandler>();
    const wrapped: EventHandler = (event) => handler(event as T);
    listeners.add(wrapped);
    this.eventListeners.set(type, listeners);
    return () => {
      listeners.delete(wrapped);
      if (!listeners.size) this.eventListeners.delete(type);
    };
  }

  subscribeStatus(handler: StatusHandler): () => void {
    this.statusListeners.add(handler);
    handler(this.status);
    return () => this.statusListeners.delete(handler);
  }

  subscribeConnected(handler: () => void): () => void {
    this.connectedListeners.add(handler);
    return () => this.connectedListeners.delete(handler);
  }

  private open(): void {
    if (!this.running || this.socket || this.opening) return;
    const auth = this.dependencies.getAuth();
    if (!auth) {
      this.running = false;
      this.setStatus('AUTH_REQUIRED');
      return;
    }
    this.setStatus('CONNECTING');
    this.opening = true;
    const generation = ++this.socketGeneration;
    let socketPromise: SocketTask | Promise<SocketTask>;
    try {
      socketPromise = this.dependencies.createSocket(this.dependencies.getUrl());
    } catch {
      this.opening = false;
      this.scheduleReconnect();
      return;
    }

    Promise.resolve(socketPromise).then(
      (socket) => {
        if (!this.running || generation !== this.socketGeneration) {
          socket.close();
          return;
        }
        this.opening = false;
        this.socket = socket;
        socket.onOpen(() => {
          if (!this.isCurrent(socket, generation)) return;
          this.reconnectAttempt = 0;
        });
        socket.onMessage(({ data }) => {
          if (!this.isCurrent(socket, generation) || typeof data !== 'string') return;
          this.handlePacket(data, auth.classId, socket);
        });
        socket.onError(() => this.onSocketClosed(socket, generation));
        socket.onClose(() => this.onSocketClosed(socket, generation));
      },
      () => {
        if (generation !== this.socketGeneration) return;
        this.opening = false;
        this.scheduleReconnect();
      },
    );
  }

  private handlePacket(packet: string, classId: string, socket: SocketTask): void {
    if (packet.startsWith('0')) {
      // Engine.IO v4 open packet; connect to Socket.IO namespace with handshake auth.
      const auth = this.dependencies.getAuth();
      if (auth?.classId === classId) {
        socket.send({ data: `40/realtime,${JSON.stringify(auth)}` });
      }
      return;
    }
    if (packet === '2') {
      socket.send({ data: '3' });
      return;
    }
    if (packet.startsWith('40/realtime')) {
      this.setStatus('CONNECTED');
      for (const handler of this.connectedListeners) handler();
      return;
    }
    if (packet.startsWith('44/realtime')) {
      this.authRejected = true;
      this.running = false;
      this.setStatus('AUTH_REQUIRED');
      socket.close();
      return;
    }
    if (!packet.startsWith('42/realtime,')) return;

    try {
      const eventTuple = JSON.parse(packet.slice('42/realtime,'.length)) as unknown;
      if (!Array.isArray(eventTuple) || typeof eventTuple[0] !== 'string') return;
      const event = eventTuple[1] as ClassRealtimeEvent | undefined;
      if (!event || event.classId !== classId || event.type !== eventTuple[0]) return;
      if (this.dependencies.getAuth()?.classId !== classId) return;
      if (event.id) {
        if (this.seenEventIds.has(event.id)) return;
        this.seenEventIds.add(event.id);
        if (this.seenEventIds.size > 512) {
          const oldest = this.seenEventIds.values().next().value;
          if (oldest) this.seenEventIds.delete(oldest);
        }
      }
      for (const listener of this.eventListeners.get(event.type) ?? []) listener(event);
    } catch {
      // Ignore malformed or unsupported Socket.IO packets; the next foreground pull repairs state.
    }
  }

  private isCurrent(socket: SocketTask, generation: number): boolean {
    return this.socket === socket && this.socketGeneration === generation;
  }

  private onSocketClosed(socket: SocketTask, generation: number): void {
    if (!this.isCurrent(socket, generation)) return;
    this.socket = null;
    this.socketGeneration += 1;
    if (!this.authRejected) this.setStatus('DISCONNECTED');
    if (this.running && !this.authRejected) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer !== null) return;
    this.setStatus('DISCONNECTED');
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempt, 5));
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.dependencies.schedule(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private setStatus(status: RealtimeConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const handler of this.statusListeners) handler(status);
  }
}
