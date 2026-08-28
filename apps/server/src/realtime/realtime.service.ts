import { Injectable, Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import {
  classRoomName,
  isDisplayPrincipal,
  isUserPrincipal,
  type ClassRealtimeEvent,
  type JwtPrincipal,
} from '../common';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server?: Server;
  private readonly clients = new Map<string, Socket>();

  attachServer(server: Server): void {
    this.server = server;
  }

  registerClient(client: Socket, principal: JwtPrincipal, classId: string): void {
    client.data.principal = principal;
    client.data.classId = classId;
    this.clients.set(client.id, client);
  }

  unregisterClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  disconnectSession(sessionId: string): void {
    this.disconnectMatching(
      (principal) => isUserPrincipal(principal) && principal.sessionId === sessionId,
    );
  }

  disconnectUser(userId: string): void {
    this.disconnectMatching((principal) => isUserPrincipal(principal) && principal.sub === userId);
  }

  disconnectDevice(deviceId: string): void {
    this.disconnectMatching(
      (principal) => isDisplayPrincipal(principal) && principal.sub === deviceId,
    );
  }

  publishClassEvent<TPayload>(classId: string, event: ClassRealtimeEvent<TPayload>): void {
    if (event.classId !== classId) {
      this.logger.error(
        `Refusing realtime event ${event.id}: classId ${event.classId} does not match ${classId}`,
      );
      return;
    }

    if (!this.server) {
      this.logger.warn(`Realtime server is not ready; event ${event.id} was not broadcast`);
      return;
    }

    try {
      this.server.to(classRoomName(classId)).emit(event.type, event);
    } catch (error) {
      const message = error instanceof Error ? error.stack : String(error);
      this.logger.error(`Failed to broadcast realtime event ${event.id}`, message);
    }
  }

  private disconnectMatching(predicate: (principal: JwtPrincipal) => boolean): void {
    for (const client of this.clients.values()) {
      const principal = client.data.principal as JwtPrincipal | undefined;
      if (principal && predicate(principal)) {
        client.disconnect(true);
      }
    }
  }
}
