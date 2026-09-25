import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { Server as HTTPServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { SessionClientType } from '@prisma/client';
import { prisma } from '../../plugins/prisma';
import { config } from '../../config';
import { classRoomName, ClassEventType, type ClassRealtimeEvent } from './realtime.types';
import { PrincipalType, type AccessTokenClaims } from '../../plugins/auth';

export class RealtimeService {
  private io?: SocketIOServer;
  private readonly clients = new Map<string, Socket>();

  attach(httpServer: HTTPServer): void {
    this.io = new SocketIOServer(httpServer, {
      path: '/socket.io',
      cors: {
        origin: config.corsOrigins.length ? config.corsOrigins : '*',
        credentials: true,
      },
    });

    const namespace = this.io.of('/realtime');

    namespace.use(async (socket, next) => {
      try {
        const auth = (socket.handshake.auth || {}) as { token?: string; classId?: string };
        const token = auth.token;
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, config.jwtAccessSecret) as AccessTokenClaims;
        if (!decoded || !decoded.sub) {
          return next(new Error('Invalid token'));
        }

        if (decoded.type === PrincipalType.DISPLAY_DEVICE) {
          const device = await prisma.displayDevice.findFirst({
            where: { id: decoded.sub, classId: decoded.classId, status: 'ACTIVE' },
            select: { id: true, classId: true },
          });
          if (!device) {
            return next(new Error('Display device deactivated'));
          }
          socket.data.principal = decoded;
          socket.data.classId = decoded.classId;
          return next();
        }

        if (decoded.type === PrincipalType.USER && decoded.sessionId) {
          const session = await prisma.session.findUnique({
            where: { id: decoded.sessionId },
            include: { user: true },
          });
          if (
            !session ||
            session.userId !== decoded.sub ||
            session.user.status !== 'ACTIVE' ||
            session.revokedAt ||
            session.expiresAt <= new Date()
          ) {
            return next(new Error('Session revoked or expired'));
          }

          const requestedClassId = auth.classId;
          if (requestedClassId) {
            const hasAccess = await prisma.classTeacher.findFirst({
              where: {
                teacherId: decoded.sub,
                classId: requestedClassId,
                status: 'ACTIVE',
              },
            });
            if (!hasAccess) {
              return next(new Error('Forbidden class access'));
            }
            socket.data.classId = requestedClassId;
          }

          socket.data.principal = decoded;
          socket.data.clientType = session.clientType;
          socket.data.teacherName = session.user.name;
          return next();
        }

        return next(new Error('Unsupported principal type'));
      } catch (err) {
        return next(new Error(err instanceof Error ? err.message : 'Unauthorized'));
      }
    });

    namespace.on('connection', async (socket) => {
      const classId = socket.data.classId as string | undefined;
      const principal = socket.data.principal as AccessTokenClaims | undefined;

      this.clients.set(socket.id, socket);

      if (classId) {
        await socket.join(classRoomName(classId));
      }

      if (
        classId &&
        principal?.type === PrincipalType.USER &&
        socket.data.clientType === SessionClientType.TEACHER_MOBILE
      ) {
        const event: ClassRealtimeEvent<{
          teacherId: string;
          teacherName: string;
        }> = {
          id: randomUUID(),
          type: ClassEventType.TEACHER_CONNECTED,
          classId,
          occurredAt: new Date().toISOString(),
          payload: {
            teacherId: principal.sub,
            teacherName: socket.data.teacherName as string,
          },
        };
        socket.to(classRoomName(classId)).emit(event.type, event);
      }

      if (principal?.type === PrincipalType.DISPLAY_DEVICE && classId) {
        await prisma.displayDevice
          .update({
            where: { id: principal.sub },
            data: { lastSeenAt: new Date() },
          })
          .catch(() => undefined);
      }

      socket.on('disconnect', () => {
        this.clients.delete(socket.id);
        if (principal?.type === PrincipalType.DISPLAY_DEVICE && classId) {
          const stillConnected = this.getConnectedDisplayDeviceIds(classId).includes(principal.sub);
          if (!stillConnected) {
            void prisma.displayDevice
              .update({
                where: { id: principal.sub },
                data: { soundReady: false, soundReadyAt: null },
              })
              .catch(() => undefined);
            void prisma.announcementDelivery
              .findMany({
                where: {
                  deviceId: principal.sub,
                  isPrimary: true,
                  announcement: { status: { in: ['WAITING_DISPLAY', 'DISPLAYING'] } },
                },
                select: { id: true, announcementId: true },
              })
              .then(async (deliveries) => {
                for (const delivery of deliveries) {
                  await prisma.announcementDelivery.update({
                    where: { id: delivery.id },
                    data: { soundStatus: 'INTERRUPTED' },
                  });
                  this.publishClassEvent(classId, {
                    id: randomUUID(),
                    type: ClassEventType.ANNOUNCEMENT_CHANGED,
                    classId,
                    occurredAt: new Date().toISOString(),
                    payload: { announcementId: delivery.announcementId },
                  });
                }
              })
              .catch(() => undefined);
          }
        }
      });
    });

    console.log('⚡ Socket.IO realtime server attached on /realtime');
  }

  publishClassEvent<TPayload>(classId: string, event: ClassRealtimeEvent<TPayload>): void {
    if (!this.io) {
      return;
    }
    try {
      this.io.of('/realtime').to(classRoomName(classId)).emit(event.type, event);
    } catch (error) {
      console.error(`[Realtime] Failed to broadcast event ${event.id}:`, error);
    }
  }

  getConnectedDisplayDeviceIds(classId: string): string[] {
    const ids = new Set<string>();
    for (const client of this.clients.values()) {
      const principal = client.data.principal as AccessTokenClaims | undefined;
      if (
        client.connected &&
        client.data.classId === classId &&
        principal?.type === PrincipalType.DISPLAY_DEVICE
      ) {
        ids.add(principal.sub);
      }
    }
    return [...ids];
  }

  disconnectUser(userId: string): void {
    for (const client of this.clients.values()) {
      const principal = client.data.principal as AccessTokenClaims | undefined;
      if (principal?.type === PrincipalType.USER && principal.sub === userId) {
        client.disconnect(true);
      }
    }
  }

  disconnectSession(sessionId: string): void {
    for (const client of this.clients.values()) {
      const principal = client.data.principal as AccessTokenClaims | undefined;
      if (
        principal?.type === PrincipalType.USER &&
        'sessionId' in principal &&
        principal.sessionId === sessionId
      ) {
        client.disconnect(true);
      }
    }
  }

  disconnectDevice(deviceId: string): void {
    for (const client of this.clients.values()) {
      const principal = client.data.principal as AccessTokenClaims | undefined;
      if (principal?.type === PrincipalType.DISPLAY_DEVICE && principal.sub === deviceId) {
        client.disconnect(true);
      }
    }
  }
}

export const realtimeService = new RealtimeService();
