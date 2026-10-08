import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Server } from 'socket.io';
import { SocketIoRealtimeClient, type SocketTask } from './realtime-core.ts';

test(
  'mini-program transport interoperates with a real Socket.IO namespace and Engine.IO heartbeat',
  { timeout: 5_000 },
  async () => {
    const http = createServer();
    const io = new Server(http, { pingInterval: 25, pingTimeout: 200 });
    const namespace = io.of('/realtime');
    namespace.use((socket, next) => {
      const { token, classId } = socket.handshake.auth;
      next(token === 'test-token' && classId === 'class-1' ? undefined : new Error('unauthorized'));
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    assert.ok(address && typeof address !== 'string');
    const client = new SocketIoRealtimeClient({
      createSocket: async (url): Promise<SocketTask> => {
        const socket = new WebSocket(url);
        return {
          onOpen: (handler) => socket.addEventListener('open', handler),
          onMessage: (handler) =>
            socket.addEventListener('message', (event) => handler({ data: String(event.data) })),
          onError: (handler) => socket.addEventListener('error', handler),
          onClose: (handler) => socket.addEventListener('close', handler),
          send: ({ data }) => socket.send(data),
          close: () => socket.close(),
        };
      },
      getUrl: () => `ws://127.0.0.1:${address.port}/socket.io/?EIO=4&transport=websocket`,
      getAuth: () => ({ token: 'test-token', classId: 'class-1' }),
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: (timer) => clearTimeout(timer),
    });
    try {
      const connected = new Promise<void>((resolve) => client.subscribeConnected(resolve));
      const received = new Promise<string>((resolve) =>
        client.subscribe('RANDOM_PICKED', (event) => resolve(event.id)),
      );
      client.connect();
      await connected;
      assert.equal(client.getStatus(), 'CONNECTED');
      // Survive multiple real server heartbeat intervals before receiving a classroom event.
      await new Promise((resolve) => setTimeout(resolve, 300));
      namespace.emit('RANDOM_PICKED', {
        id: 'pick-1',
        type: 'RANDOM_PICKED',
        classId: 'class-1',
        occurredAt: new Date().toISOString(),
        payload: { studentId: 'student-1' },
      });
      assert.equal(await received, 'pick-1');
      assert.equal(namespace.sockets.size, 1);
    } finally {
      client.disconnect();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    }
  },
);
