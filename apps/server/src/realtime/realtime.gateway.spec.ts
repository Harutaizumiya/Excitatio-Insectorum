import { PrincipalType } from '../common';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway class-room authorization', () => {
  function setup(principal: unknown) {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        ...(principal as Record<string, unknown>),
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    };
    const config = { getOrThrow: jest.fn().mockReturnValue('access-secret') };
    const prisma = {
      displayDevice: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      classTeacher: { findFirst: jest.fn() },
      session: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'teacher-1',
          user: { status: 'ACTIVE' },
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };
    const realtime = {
      attachServer: jest.fn(),
      registerClient: jest.fn(),
      unregisterClient: jest.fn(),
    };
    const gateway = new RealtimeGateway(
      jwt as never,
      config as never,
      prisma as never,
      realtime as never,
    );
    const socket = {
      id: 'socket-1',
      handshake: { auth: { token: 'token' } },
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };
    return { gateway, prisma, socket };
  }

  it('derives a display room only from its token and rejects a requested foreign class', async () => {
    const { gateway, prisma, socket } = setup({
      sub: 'device-1',
      type: PrincipalType.DISPLAY_DEVICE,
      classId: 'class-1',
    });
    socket.handshake.auth = { token: 'token', classId: 'class-2' } as never;
    prisma.displayDevice.findFirst.mockResolvedValue({ id: 'device-1' });

    await gateway.handleConnection(socket as never);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects USER access without an ACTIVE ClassTeacher relation', async () => {
    const { gateway, prisma, socket } = setup({
      sub: 'teacher-1',
      type: PrincipalType.USER,
      sessionId: 'session-1',
    });
    socket.handshake.auth = { token: 'token', classId: 'class-1' } as never;
    prisma.classTeacher.findFirst.mockResolvedValue(null);

    await gateway.handleConnection(socket as never);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects an unbound or revoked display even when its JWT is otherwise valid', async () => {
    const { gateway, prisma, socket } = setup({
      sub: 'device-1',
      type: PrincipalType.DISPLAY_DEVICE,
      classId: 'class-1',
    });
    prisma.displayDevice.findFirst.mockResolvedValue(null);

    await gateway.handleConnection(socket as never);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('joins an ACTIVE display to exactly class:{token.classId} and touches lastSeenAt', async () => {
    jest.useFakeTimers();
    const { gateway, prisma, socket } = setup({
      sub: 'device-1',
      type: PrincipalType.DISPLAY_DEVICE,
      classId: 'class-1',
    });
    prisma.displayDevice.findFirst.mockResolvedValue({ id: 'device-1' });

    await gateway.handleConnection(socket as never);
    expect(socket.join).toHaveBeenCalledWith('class:class-1');
    expect(prisma.displayDevice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'device-1', classId: 'class-1' }),
      }),
    );
    gateway.handleDisconnect(socket as never);
    jest.useRealTimers();
  });
});
