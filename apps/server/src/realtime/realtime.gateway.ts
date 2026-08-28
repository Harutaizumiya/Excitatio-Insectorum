import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { DeviceStatus, RelationStatus, UserStatus } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { classRoomName, isDisplayPrincipal, isUserPrincipal, type JwtPrincipal } from '../common';
import { PrismaService } from '../prisma';
import { RealtimeService } from './realtime.service';

const AUTH_RECHECK_INTERVAL_MS = 45_000;

interface RealtimeHandshakeAuth {
  token?: unknown;
  classId?: unknown;
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: { credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly authRecheckTimers = new Map<string, NodeJS.Timeout>();
  private readonly tokenExpiryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attachServer(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const { principal, classId } = await this.authorize(client);
      client.data.principal = principal;
      client.data.classId = classId;
      await client.join(classRoomName(classId));
      this.realtime.registerClient(client, principal, classId);

      if (isDisplayPrincipal(principal)) {
        await this.touchDisplay(principal.sub, classId);
      }
      this.startLifecycleValidation(client, principal, classId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown authorization error';
      this.logger.warn(`Rejected realtime connection ${client.id}: ${message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const authTimer = this.authRecheckTimers.get(client.id);
    if (authTimer) {
      clearInterval(authTimer);
      this.authRecheckTimers.delete(client.id);
    }
    const expiryTimer = this.tokenExpiryTimers.get(client.id);
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      this.tokenExpiryTimers.delete(client.id);
    }
    this.realtime.unregisterClient(client.id);
  }

  private async authorize(client: Socket): Promise<{ principal: JwtPrincipal; classId: string }> {
    const auth = client.handshake.auth as RealtimeHandshakeAuth;
    if (typeof auth.token !== 'string' || auth.token.length === 0) {
      throw new Error('missing access token');
    }

    const principal = await this.jwt.verifyAsync<JwtPrincipal>(auth.token, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
    });

    if (isDisplayPrincipal(principal)) {
      if (typeof auth.classId === 'string' && auth.classId !== principal.classId) {
        throw new Error('display token cannot join another class');
      }

      const device = await this.prisma.displayDevice.findFirst({
        where: {
          id: principal.sub,
          classId: principal.classId,
          status: DeviceStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (!device) {
        throw new Error('display device is not active');
      }
      return { principal, classId: principal.classId };
    }

    if (isUserPrincipal(principal)) {
      if (typeof auth.classId !== 'string' || auth.classId.length === 0) {
        throw new Error('user connections must specify classId');
      }

      const [session, access] = await Promise.all([
        this.prisma.session.findUnique({
          where: { id: principal.sessionId },
          include: { user: { select: { status: true } } },
        }),
        this.prisma.classTeacher.findFirst({
          where: {
            classId: auth.classId,
            teacherId: principal.sub,
            status: RelationStatus.ACTIVE,
          },
          select: { id: true },
        }),
      ]);
      if (
        !session ||
        session.userId !== principal.sub ||
        session.user.status !== UserStatus.ACTIVE ||
        session.revokedAt !== null ||
        session.expiresAt <= new Date()
      ) {
        throw new Error('user session is not active');
      }
      if (!access) {
        throw new Error('user has no active class access');
      }
      return { principal, classId: auth.classId };
    }

    throw new Error('unsupported principal type');
  }

  private startLifecycleValidation(client: Socket, principal: JwtPrincipal, classId: string): void {
    if (typeof principal.exp !== 'number') {
      client.disconnect(true);
      return;
    }

    const expiresInMs = principal.exp * 1000 - Date.now();
    if (expiresInMs <= 0) {
      client.disconnect(true);
      return;
    }

    const expiryTimer = setTimeout(() => client.disconnect(true), expiresInMs);
    expiryTimer.unref();
    this.tokenExpiryTimers.set(client.id, expiryTimer);

    const authTimer = setInterval(() => {
      void this.revalidateConnection(principal, classId).then((active) => {
        if (!active) {
          client.disconnect(true);
        }
      });
    }, AUTH_RECHECK_INTERVAL_MS);
    authTimer.unref();
    this.authRecheckTimers.set(client.id, authTimer);
  }

  private async revalidateConnection(principal: JwtPrincipal, classId: string): Promise<boolean> {
    try {
      if (isDisplayPrincipal(principal)) {
        const device = await this.prisma.displayDevice.findFirst({
          where: { id: principal.sub, classId, status: DeviceStatus.ACTIVE },
          select: { id: true },
        });
        if (!device) return false;
        await this.touchDisplay(principal.sub, classId);
        return true;
      }

      if (isUserPrincipal(principal)) {
        const [session, access] = await Promise.all([
          this.prisma.session.findUnique({
            where: { id: principal.sessionId },
            include: { user: { select: { status: true } } },
          }),
          this.prisma.classTeacher.findFirst({
            where: { classId, teacherId: principal.sub, status: RelationStatus.ACTIVE },
            select: { id: true },
          }),
        ]);
        return Boolean(
          session &&
          session.userId === principal.sub &&
          session.user.status === UserStatus.ACTIVE &&
          session.revokedAt === null &&
          session.expiresAt > new Date() &&
          access,
        );
      }
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.stack : String(error);
      this.logger.warn(`Realtime authorization recheck failed: ${message}`);
      return false;
    }
  }

  private async touchDisplay(deviceId: string, classId: string): Promise<void> {
    try {
      await this.prisma.displayDevice.updateMany({
        where: { id: deviceId, classId, status: DeviceStatus.ACTIVE },
        data: { lastSeenAt: new Date() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.stack : String(error);
      this.logger.warn(`Failed to update lastSeenAt for display ${deviceId}: ${message}`);
    }
  }
}
