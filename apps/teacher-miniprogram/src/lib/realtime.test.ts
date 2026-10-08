import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RealtimeLifecycleController,
  SocketIoRealtimeClient,
  type RealtimeDependencies,
  type SocketMessageEvent,
  type SocketTask,
} from './realtime-core.ts';

class FakeSocket implements SocketTask {
  openHandler: (() => void) | undefined;
  messageHandler: ((event: SocketMessageEvent) => void) | undefined;
  errorHandler: (() => void) | undefined;
  closeHandler: (() => void) | undefined;
  readonly sent: string[] = [];
  closed = false;
  onOpen(handler: () => void): void {
    this.openHandler = handler;
  }
  onMessage(handler: (event: SocketMessageEvent) => void): void {
    this.messageHandler = handler;
  }
  onError(handler: () => void): void {
    this.errorHandler = handler;
  }
  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }
  send({ data }: { data: string }): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.closeHandler?.();
  }
  emit(data: string): void {
    this.messageHandler?.({ data });
  }
}

test('Socket.IO Engine.IO handshake answers ping and dispatches only the active class envelope', async () => {
  const sockets: FakeSocket[] = [];
  const statuses: string[] = [];
  const received: unknown[] = [];
  let activeClassId = 'class-a';
  const dependencies: RealtimeDependencies = {
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    getUrl: () => 'wss://example.test/socket.io/?EIO=4&transport=websocket',
    getAuth: () => ({ token: 'access', classId: activeClassId }),
    schedule: (callback) => setTimeout(callback, 0),
    cancel: (timer) => clearTimeout(timer),
  };
  const client = new SocketIoRealtimeClient(dependencies);
  client.subscribeStatus((status) => statuses.push(status));
  client.subscribe('SCORE_CHANGED', (event) => received.push(event));

  client.connect();
  const socket = sockets[0]!;
  await new Promise((resolve) => setTimeout(resolve, 0));
  socket.openHandler?.();
  socket.emit('0{"sid":"engine-session","pingInterval":25000,"pingTimeout":20000}');
  assert.equal(socket.sent[0], '40/realtime,{"token":"access","classId":"class-a"}');
  socket.emit('40/realtime,{"sid":"namespace-session"}');
  socket.emit('2');
  assert.equal(socket.sent[1], '3');
  socket.emit(
    '42/realtime,["SCORE_CHANGED",{"id":"1","type":"SCORE_CHANGED","classId":"class-a","occurredAt":"now","payload":{}}]',
  );
  socket.emit(
    '42/realtime,["SCORE_CHANGED",{"id":"1","type":"SCORE_CHANGED","classId":"class-a","occurredAt":"now","payload":{}}]',
  );
  socket.emit(
    '42/realtime,["SCORE_CHANGED",{"id":"2","type":"SCORE_CHANGED","classId":"class-b","occurredAt":"now","payload":{}}]',
  );
  activeClassId = 'class-b';
  socket.emit(
    '42/realtime,["SCORE_CHANGED",{"id":"3","type":"SCORE_CHANGED","classId":"class-a","occurredAt":"now","payload":{}}]',
  );

  assert.equal(client.getStatus(), 'CONNECTED');
  assert.equal(received.length, 1);
  assert.equal(statuses.includes('CONNECTED'), true);
  client.disconnect();
  assert.equal(client.getStatus(), 'DISCONNECTED');
  assert.equal(socket.closed, true);
});

test('realtime lifecycle connects after an initially empty class loads and follows visible class changes', () => {
  const connected: string[] = [];
  let disconnectCount = 0;
  const lifecycle = new RealtimeLifecycleController(
    (classId) => connected.push(classId),
    () => {
      disconnectCount += 1;
    },
  );

  lifecycle.show(null);
  lifecycle.setClass('class-a');
  lifecycle.setClass('class-b');
  lifecycle.hide();
  lifecycle.setClass('class-c');
  lifecycle.show();
  lifecycle.dispose();

  assert.deepEqual(connected, ['class-a', 'class-b', 'class-c']);
  assert.equal(disconnectCount, 3);
});

test('disposing an already hidden lifecycle does not disconnect a newer page socket', () => {
  const connected: string[] = [];
  let disconnectCount = 0;
  const oldPage = new RealtimeLifecycleController(
    (classId) => connected.push(classId),
    () => {
      disconnectCount += 1;
    },
  );
  const currentPage = new RealtimeLifecycleController(
    (classId) => connected.push(classId),
    () => {
      disconnectCount += 1;
    },
  );

  oldPage.show('class-a');
  oldPage.hide();
  currentPage.show('class-b');
  oldPage.dispose();

  assert.deepEqual(connected, ['class-a', 'class-b']);
  assert.equal(disconnectCount, 1);
  currentPage.dispose();
  assert.equal(disconnectCount, 2);
});

test('an async socket resolving after page hide is closed and cannot receive handlers', async () => {
  let resolveSocket!: (socket: FakeSocket) => void;
  const socketPromise = new Promise<FakeSocket>((resolve) => {
    resolveSocket = resolve;
  });
  const dependencies: RealtimeDependencies = {
    createSocket: () => socketPromise,
    getUrl: () => 'wss://example.test/socket.io/?EIO=4&transport=websocket',
    getAuth: () => ({ token: 'access', classId: 'class-a' }),
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (timer) => clearTimeout(timer),
  };
  const client = new SocketIoRealtimeClient(dependencies);
  client.connect();
  client.disconnect();
  const lateSocket = new FakeSocket();
  resolveSocket(lateSocket);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(lateSocket.closed, true);
  assert.equal(client.getStatus(), 'DISCONNECTED');
});

test('hiding a page disconnects the socket and cancels pending reconnects', async () => {
  const sockets: FakeSocket[] = [];
  const callbacks: Array<() => void> = [];
  const cancelled = new Set<ReturnType<typeof setTimeout>>();
  const dependencies: RealtimeDependencies = {
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    getUrl: () => 'wss://example.test/socket.io/?EIO=4&transport=websocket',
    getAuth: () => ({ token: 'access', classId: 'class-a' }),
    schedule: (callback) => {
      callbacks.push(callback);
      return setTimeout(() => undefined, 60_000);
    },
    cancel: (timer) => {
      cancelled.add(timer);
      clearTimeout(timer);
    },
  };
  const client = new SocketIoRealtimeClient(dependencies);
  client.connect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  sockets[0]!.closeHandler?.();
  client.disconnect();

  assert.equal(cancelled.size, 1);
  callbacks[0]?.();
  assert.equal(sockets.length, 1);
  client.connect();
  assert.equal(sockets.length, 2);
  client.disconnect();
});

test('missing auth stops realtime without opening a socket', () => {
  let opened = false;
  const dependencies: RealtimeDependencies = {
    createSocket: () => {
      opened = true;
      return new FakeSocket();
    },
    getUrl: () => '',
    getAuth: () => null,
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (timer) => clearTimeout(timer),
  };
  const client = new SocketIoRealtimeClient(dependencies);
  client.connect();
  assert.equal(opened, false);
  assert.equal(client.getStatus(), 'AUTH_REQUIRED');
});
