import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DeviceStatus, Prisma, StudentStatus } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { BusinessException, PrincipalType, type DisplayAccessTokenClaims } from '../common';
import { isPostgresDatabase, PrismaService } from '../prisma';
import { RankingService } from '../ranking';
import { RedisService } from '../redis';
import { RealtimeService } from '../realtime';
import { SchedulesService } from '../schedules';
import type {
  BindByCodeDto,
  BindByCodeResponseDto,
  BindDisplayDeviceDto,
  BindingSessionStatusResponseDto,
  CreateBindingCodeResponseDto,
  CreateClassroomBindingCodeDto,
  CreateClassroomBindingCodeResponseDto,
  PollBindingSessionResponseDto,
} from './dto';

const BINDING_TTL_SECONDS = 10 * 60;
const BINDING_RATE_WINDOW_SECONDS = 60;
const BINDING_RATE_LIMIT = 10;
const DEVICE_CREDENTIAL_BCRYPT_ROUNDS = 12;
const MAX_ACTIVE_DEVICES = 2;
const SERIALIZABLE_RETRIES = 3;
const ONLINE_WINDOW_MS = 90_000;

interface BindingCodeState {
  bindingSessionId: string;
  nonceHash: string;
  expiresAt: string;
}

interface PendingBindingSession extends BindingCodeState {
  status: 'PENDING';
}

interface ReadyBindingSession extends BindingCodeState {
  status: 'READY';
  deviceId: string;
  credentialCiphertext: string;
  credentialIv: string;
  credentialTag: string;
}

type BindingSession = PendingBindingSession | ReadyBindingSession;

@Injectable()
export class DisplaysService {
  private readonly logger = new Logger(DisplaysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly ranking: RankingService,
    @Optional() private readonly realtime?: RealtimeService,
    @Optional() private readonly schedules?: SchedulesService,
  ) {}

  async createBindingCode(clientAddress: string): Promise<CreateBindingCodeResponseDto> {
    await this.enforceBindingCodeRateLimit(clientAddress);

    const bindingSessionId = randomUUID();
    const nonce = randomBytes(32).toString('base64url');
    const nonceHash = this.hashNonce(nonce);
    const expiresAt = new Date(Date.now() + BINDING_TTL_SECONDS * 1000).toISOString();
    const state: PendingBindingSession = {
      status: 'PENDING',
      bindingSessionId,
      nonceHash,
      expiresAt,
    };

    let code: string | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const result = await this.redis.client.set(
        this.bindingCodeKey(candidate),
        JSON.stringify(state satisfies BindingSession),
        'EX',
        BINDING_TTL_SECONDS,
        'NX',
      );
      if (result === 'OK') {
        code = candidate;
        break;
      }
    }

    if (!code) {
      throw new BusinessException(
        'BINDING_CODE_UNAVAILABLE',
        '暂时无法生成绑定码，请稍后重试',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    await this.redis.setJson(this.bindingSessionKey(bindingSessionId), state, BINDING_TTL_SECONDS);
    return { code, expiresAt, bindingSessionId, nonce };
  }

  async bindDevice(
    classId: string,
    input: BindDisplayDeviceDto,
    actorId = 'unknown',
    clientAddress = 'unknown',
  ): Promise<{ deviceId: string }> {
    await this.enforceBindingAttemptRateLimit(actorId, classId, clientAddress);
    const consumed = await this.redis.client.getdel(this.bindingCodeKey(input.code));
    if (!consumed) {
      throw new BusinessException(
        'BINDING_CODE_INVALID',
        '绑定码无效、已过期或已被使用',
        HttpStatus.GONE,
      );
    }

    const bindingState = this.parseBindingState(consumed);
    if (Date.parse(bindingState.expiresAt) <= Date.now()) {
      throw new BusinessException('BINDING_CODE_EXPIRED', '绑定码已过期', HttpStatus.GONE);
    }

    const deviceId = randomUUID();
    const credential = randomBytes(48).toString('base64url');
    const secretHash = await hash(credential, DEVICE_CREDENTIAL_BCRYPT_ROUNDS);

    await this.createDeviceWithLimit({
      deviceId,
      classId,
      name: input.name.trim(),
      secretHash,
    });

    const ttlSeconds = Math.max(
      1,
      Math.ceil((Date.parse(bindingState.expiresAt) - Date.now()) / 1000),
    );
    const ready: ReadyBindingSession = {
      ...bindingState,
      status: 'READY',
      deviceId,
      ...this.sealCredential(credential),
    };
    try {
      await this.redis.setJson(
        this.bindingSessionKey(bindingState.bindingSessionId),
        ready,
        ttlSeconds,
      );
    } catch (error) {
      await this.compensateFailedBinding(deviceId);
      throw error;
    }

    return { deviceId };
  }

  async pollBindingSession(
    bindingSessionId: string,
    nonce: string,
  ): Promise<PollBindingSessionResponseDto> {
    const key = this.bindingSessionKey(bindingSessionId);
    const session = await this.redis.getJson<BindingSession>(key);
    if (!session || session.bindingSessionId !== bindingSessionId) {
      throw new BusinessException(
        'BINDING_SESSION_NOT_FOUND',
        '绑定会话不存在或已过期',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!this.safeEqualNonce(session.nonceHash, nonce)) {
      throw new BusinessException(
        'BINDING_SESSION_FORBIDDEN',
        '绑定会话校验失败',
        HttpStatus.FORBIDDEN,
      );
    }
    if (session.status === 'PENDING') {
      return { status: 'PENDING' };
    }

    const consumed = await this.redis.client.getdel(key);
    if (!consumed) {
      throw new BusinessException(
        'BINDING_CREDENTIAL_ALREADY_CLAIMED',
        '设备凭证已被领取',
        HttpStatus.GONE,
      );
    }
    const ready = this.parseBindingState(consumed);
    if (ready.status !== 'READY') {
      throw new BusinessException('BINDING_SESSION_NOT_READY', '绑定尚未完成', HttpStatus.CONFLICT);
    }
    return {
      status: 'READY',
      deviceId: ready.deviceId,
      credential: this.openCredential(ready),
    };
  }

  async exchangeCredential(
    deviceId: string,
    credential: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const now = new Date();
    const device = await this.prisma.displayDevice.findFirst({
      where: { id: deviceId, status: DeviceStatus.ACTIVE },
      select: {
        id: true,
        classId: true,
        credentials: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { secretHash: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    let valid = false;
    if (device) {
      for (const stored of device.credentials) {
        if (await compare(credential, stored.secretHash)) {
          valid = true;
          break;
        }
      }
    }
    if (!device || !valid) {
      throw new BusinessException(
        'INVALID_DEVICE_CREDENTIAL',
        '设备不存在、已吊销或凭证错误',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const expiresIn = this.parseDurationSeconds(
      this.config.getOrThrow<string>('jwt.deviceAccessExpiresIn'),
    );
    const claims: Omit<DisplayAccessTokenClaims, 'iat' | 'exp'> = {
      sub: device.id,
      type: PrincipalType.DISPLAY_DEVICE,
      classId: device.classId,
    };
    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn,
    });
    return { accessToken, expiresIn };
  }

  async listDevices(classId: string): Promise<
    Array<{
      id: string;
      name: string;
      status: DeviceStatus;
      lastSeenAt: Date | null;
      createdAt: Date;
      revokedAt: Date | null;
      online: boolean;
    }>
  > {
    const devices = await this.prisma.displayDevice.findMany({
      where: { classId },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const onlineAfter = Date.now() - ONLINE_WINDOW_MS;
    return devices.map((device) => ({
      ...device,
      online:
        device.status === DeviceStatus.ACTIVE &&
        device.lastSeenAt !== null &&
        device.lastSeenAt.getTime() > onlineAfter,
    }));
  }

  async revokeDevice(classId: string, deviceId: string): Promise<{ deviceId: string }> {
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.displayDevice.updateMany({
        where: { id: deviceId, classId, status: DeviceStatus.ACTIVE },
        data: { status: DeviceStatus.REVOKED, revokedAt: now },
      });
      if (revoked.count !== 1) {
        throw new BusinessException(
          'DISPLAY_DEVICE_NOT_FOUND',
          '大屏设备不存在或已吊销',
          HttpStatus.NOT_FOUND,
        );
      }
      await transaction.deviceCredential.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
    this.realtime?.disconnectDevice(deviceId);
    return { deviceId };
  }

  async getBootstrap(
    deviceId: string,
    classId: string,
  ): Promise<{
    classroom: { id: string; name: string; gridRows: number; gridCols: number };
    layout: {
      version: number | null;
      seats: Array<{
        row: number;
        col: number;
        student: { id: string; name: string } | null;
      }>;
    };
    ranking: {
      top3: Array<{ studentId: string; name: string; rank: number }>;
      progress: Array<{ studentId: string; name: string; change: number }>;
    };
    schedule: {
      periods: Array<{ periodNo: number; startTime: string; endTime: string }>;
      entries: Array<{ weekday: number; periodNo: number; courseName: string }>;
    };
  }> {
    const [device, classroom, weeklyRanking, schedule] = await Promise.all([
      this.prisma.displayDevice.findFirst({
        where: { id: deviceId, classId, status: DeviceStatus.ACTIVE },
        select: { id: true },
      }),
      this.prisma.classroom.findUnique({
        where: { id: classId },
        select: {
          id: true,
          name: true,
          gridRows: true,
          gridCols: true,
          currentLayout: {
            select: {
              version: true,
              seats: {
                select: {
                  rowIndex: true,
                  colIndex: true,
                  cellType: true,
                  student: { select: { id: true, name: true, status: true } },
                },
                orderBy: [{ rowIndex: 'asc' }, { colIndex: 'asc' }],
              },
            },
          },
        },
      }),
      this.ranking.getWeeklyRanking(classId),
      this.schedules?.getForDisplay(classId) ?? { periods: [], entries: [] },
    ]);

    if (!device) {
      throw new BusinessException(
        'DISPLAY_DEVICE_REVOKED',
        '设备未绑定或已吊销',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (!classroom) {
      throw new BusinessException('CLASS_NOT_FOUND', '班级不存在', HttpStatus.NOT_FOUND);
    }

    return {
      classroom: {
        id: classroom.id,
        name: classroom.name,
        gridRows: classroom.gridRows,
        gridCols: classroom.gridCols,
      },
      layout: {
        version: classroom.currentLayout?.version ?? null,
        seats:
          classroom.currentLayout?.seats.map((seat) => ({
            row: seat.rowIndex,
            col: seat.colIndex,
            cellType: seat.cellType?.toLowerCase() ?? "seat",
            student:
              seat.student?.status === StudentStatus.ACTIVE
                ? { id: seat.student.id, name: seat.student.name }
                : null,
          })) ?? [],
      },
      ranking: {
        top3: weeklyRanking.top3,
        progress: weeklyRanking.progress.map(({ studentId, name, change }) => ({
          studentId,
          name,
          change,
        })),
      },
      schedule,
    };
  }

  private async createDeviceWithLimit(input: {
    deviceId: string;
    classId: string;
    name: string;
    secretHash: string;
  }): Promise<void> {
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        await this.prisma.$transaction(
          async (transaction) => {
            const activeCount = await transaction.displayDevice.count({
              where: { classId: input.classId, status: DeviceStatus.ACTIVE },
            });
            if (activeCount >= MAX_ACTIVE_DEVICES) {
              throw new BusinessException(
                'DISPLAY_DEVICE_LIMIT_REACHED',
                '每个班级最多绑定两个有效大屏设备',
                HttpStatus.CONFLICT,
              );
            }
            await transaction.displayDevice.create({
              data: {
                id: input.deviceId,
                classId: input.classId,
                name: input.name,
                credentials: { create: { secretHash: input.secretHash } },
              },
              select: { id: true },
            });
          },
          isPostgresDatabase()
            ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
            : undefined,
        );
        return;
      } catch (error) {
        if (error instanceof BusinessException) {
          throw error;
        }
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable || attempt === SERIALIZABLE_RETRIES) {
          throw error;
        }
      }
    }
  }

  private async enforceBindingCodeRateLimit(clientAddress: string): Promise<void> {
    const identity = createHash('sha256')
      .update(clientAddress || 'unknown')
      .digest('hex');
    const key = `display:binding:rate:${identity}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, BINDING_RATE_WINDOW_SECONDS);
    }
    if (count > BINDING_RATE_LIMIT) {
      throw new BusinessException(
        'BINDING_CODE_RATE_LIMITED',
        '绑定码请求过于频繁，请稍后重试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async enforceBindingAttemptRateLimit(
    actorId: string,
    classId: string,
    clientAddress: string,
  ): Promise<void> {
    const identity = createHash('sha256')
      .update(`${actorId}:${classId}:${clientAddress}`)
      .digest('hex');
    const key = `display:binding:attempt:${identity}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, BINDING_RATE_WINDOW_SECONDS);
    }
    if (count > 20) {
      throw new BusinessException(
        'BINDING_ATTEMPT_RATE_LIMITED',
        '设备绑定尝试过于频繁，请稍后重试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async compensateFailedBinding(deviceId: string): Promise<void> {
    const now = new Date();
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.displayDevice.updateMany({
          where: { id: deviceId, status: DeviceStatus.ACTIVE },
          data: { status: DeviceStatus.REVOKED, revokedAt: now },
        });
        await transaction.deviceCredential.updateMany({
          where: { deviceId, revokedAt: null },
          data: { revokedAt: now },
        });
      });
    } catch (error) {
      this.logger.error(`Failed to compensate display binding ${deviceId}: ${String(error)}`);
    }
  }

  private sealCredential(credential: string): {
    credentialCiphertext: string;
    credentialIv: string;
    credentialTag: string;
  } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.bindingEncryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()]);
    return {
      credentialCiphertext: ciphertext.toString('base64url'),
      credentialIv: iv.toString('base64url'),
      credentialTag: cipher.getAuthTag().toString('base64url'),
    };
  }

  private openCredential(session: ReadyBindingSession): string {
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.bindingEncryptionKey(),
        Buffer.from(session.credentialIv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(session.credentialTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(session.credentialCiphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new BusinessException('BINDING_SESSION_INVALID', '绑定凭证无法解密', HttpStatus.GONE);
    }
  }

  private bindingEncryptionKey(): Buffer {
    return createHash('sha256')
      .update(this.config.getOrThrow<string>('security.deviceBindingSecret'))
      .digest();
  }

  private parseBindingState(serialized: string): BindingSession {
    try {
      const state = JSON.parse(serialized) as Partial<BindingSession>;
      if (
        typeof state.bindingSessionId !== 'string' ||
        typeof state.nonceHash !== 'string' ||
        typeof state.expiresAt !== 'string' ||
        (state.status !== 'PENDING' && state.status !== 'READY')
      ) {
        throw new Error('invalid shape');
      }
      if (
        state.status === 'READY' &&
        (typeof state.deviceId !== 'string' ||
          typeof state.credentialCiphertext !== 'string' ||
          typeof state.credentialIv !== 'string' ||
          typeof state.credentialTag !== 'string')
      ) {
        throw new Error('invalid ready shape');
      }
      return state as BindingSession;
    } catch {
      throw new BusinessException('BINDING_SESSION_INVALID', '绑定会话数据无效', HttpStatus.GONE);
    }
  }

  private hashNonce(nonce: string): string {
    return createHash('sha256').update(nonce).digest('hex');
  }

  private safeEqualNonce(expectedHash: string, nonce: string): boolean {
    const actualHash = this.hashNonce(nonce);
    if (expectedHash.length !== actualHash.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash));
  }

  private parseDurationSeconds(value: string): number {
    const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
    if (!match) {
      throw new Error(`Invalid device access duration: ${value}`);
    }
    const amount = Number.parseInt(match[1], 10);
    const factors = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400 } as const;
    return Math.max(1, Math.ceil(amount * factors[match[2] as keyof typeof factors]));
  }

  async createClassroomBindingCode(
    classId: string,
    input: CreateClassroomBindingCodeDto,
    _teacherId = 'unknown',
    clientAddress = 'unknown',
  ): Promise<CreateClassroomBindingCodeResponseDto> {
    await this.enforceBindingCodeRateLimit(clientAddress);

    const activeCount = await this.prisma.displayDevice.count({
      where: { classId, status: DeviceStatus.ACTIVE },
    });
    if (activeCount >= MAX_ACTIVE_DEVICES) {
      throw new BusinessException(
        'DISPLAY_DEVICE_LIMIT_REACHED',
        '本班可用大屏设备已达上限（最多 2 台）',
        HttpStatus.CONFLICT,
      );
    }

    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + BINDING_TTL_SECONDS * 1000).toISOString();
    const sessionState = {
      sessionId,
      code: '',
      classId,
      deviceName: input.name.trim(),
      status: 'PENDING' as const,
      expiresAt,
    };

    let code: string | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = randomInt(0, 1_000_000).toString().padStart(6, '0');
      sessionState.code = candidate;
      const result = await this.redis.client.set(
        this.classroomBindingCodeKey(candidate),
        JSON.stringify(sessionState),
        'EX',
        BINDING_TTL_SECONDS,
        'NX',
      );
      if (result === 'OK') {
        code = candidate;
        break;
      }
    }

    if (!code) {
      throw new BusinessException(
        'BINDING_CODE_UNAVAILABLE',
        '暂时无法生成绑定码，请稍后重试',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    await this.redis.setJson(
      this.classroomBindingSessionKey(sessionId),
      sessionState,
      BINDING_TTL_SECONDS,
    );
    return { code, expiresAt, sessionId };
  }

  async bindDisplayByCode(
    input: BindByCodeDto,
    clientAddress = 'unknown',
  ): Promise<BindByCodeResponseDto> {
    await this.enforceBindingCodeRateLimit(clientAddress);
    const consumed = await this.redis.client.getdel(this.classroomBindingCodeKey(input.code));
    if (!consumed) {
      throw new BusinessException(
        'BINDING_CODE_INVALID',
        '绑定码无效、已过期或已被使用',
        HttpStatus.GONE,
      );
    }

    interface StateShape {
      sessionId: string;
      classId: string;
      deviceName: string;
      expiresAt: string;
    }
    const state = JSON.parse(consumed) as StateShape;
    if (Date.parse(state.expiresAt) <= Date.now()) {
      throw new BusinessException('BINDING_CODE_EXPIRED', '绑定码已过期', HttpStatus.GONE);
    }

    const deviceId = randomUUID();
    const credential = randomBytes(48).toString('base64url');
    const secretHash = await hash(credential, DEVICE_CREDENTIAL_BCRYPT_ROUNDS);

    await this.createDeviceWithLimit({
      deviceId,
      classId: state.classId,
      name: state.deviceName,
      secretHash,
    });

    const classroom = await this.prisma.classroom.findUnique({
      where: { id: state.classId },
      select: { id: true, name: true },
    });

    const ttlSeconds = Math.max(
      1,
      Math.ceil((Date.parse(state.expiresAt) - Date.now()) / 1000),
    );
    const readyState = {
      ...state,
      status: 'READY' as const,
      deviceId,
    };
    await this.redis.setJson(
      this.classroomBindingSessionKey(state.sessionId),
      readyState,
      ttlSeconds,
    );

    return {
      deviceId,
      credential,
      classroom: {
        id: classroom?.id ?? state.classId,
        name: classroom?.name ?? '班级大屏',
      },
    };
  }

  async getClassroomBindingSessionStatus(
    classId: string,
    sessionId: string,
  ): Promise<BindingSessionStatusResponseDto> {
    interface SessionData {
      classId: string;
      status: 'PENDING' | 'READY';
      deviceId?: string;
      expiresAt: string;
    }
    const session = await this.redis.getJson<SessionData>(
      this.classroomBindingSessionKey(sessionId),
    );
    if (!session || session.classId !== classId) {
      return { status: 'EXPIRED' };
    }
    if (Date.parse(session.expiresAt) <= Date.now()) {
      return { status: 'EXPIRED' };
    }
    if (session.status === 'READY') {
      return { status: 'READY', deviceId: session.deviceId };
    }
    return { status: 'PENDING' };
  }

  private classroomBindingCodeKey(code: string): string {
    return `display:class-code:${code}`;
  }

  private classroomBindingSessionKey(sessionId: string): string {
    return `display:class-session:${sessionId}`;
  }

  private bindingCodeKey(code: string): string {
    return `display:binding:${code}`;
  }

  private bindingSessionKey(bindingSessionId: string): string {
    return `display:binding:session:${bindingSessionId}`;
  }
}
