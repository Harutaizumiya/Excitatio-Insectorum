import { randomUUID } from 'node:crypto';
import { Prisma, type Announcement, type AnnouncementDelivery } from '@prisma/client';
import { prisma } from '../../plugins/prisma';
import { BusinessError } from '../../plugins/error-handler';
import { studentsService } from '../students/students.service';
import { ClassEventType } from '../realtime/realtime.types';
import { realtimeService } from '../realtime/realtime.service';

const RECEIVE_MS = 10_000;
const INPUT_MS = 60_000;
const RETAIN_MS = 7 * 24 * 60 * 60_000;
const activeStatuses = ['WAITING_DISPLAY', 'DISPLAYING'];

type AnnouncementWithRelations = Prisma.AnnouncementGetPayload<{
  include: { deliveries: true; reply: true };
}>;

function publish(classId: string, announcementId: string): void {
  realtimeService.publishClassEvent(classId, {
    id: randomUUID(),
    type: ClassEventType.ANNOUNCEMENT_CHANGED,
    classId,
    occurredAt: new Date().toISOString(),
    payload: { announcementId },
  });
}

function detail(row: AnnouncementWithRelations) {
  return {
    id: row.id,
    classId: row.classId,
    teacherId: row.teacherId,
    teacherName: row.teacherName,
    studentId: row.studentId,
    studentName: row.studentName,
    mode: row.mode,
    text: row.text,
    repeatCount: row.repeatCount,
    durationSeconds: row.durationSeconds,
    status: row.status,
    primaryDeviceId: row.primaryDeviceId,
    sentAt: row.sentAt,
    acknowledgedAt: row.acknowledgedAt,
    endedAt: row.endedAt,
    endReason: row.endReason,
    deliveries: row.deliveries.map((delivery) => ({
      deviceId: delivery.deviceId,
      isPrimary: delivery.isPrimary,
      displayedAt: delivery.displayedAt,
      expiresAt: delivery.expiresAt,
      inputUntil: delivery.inputUntil,
      pauseUsed: delivery.pauseUsed,
      soundStatus: delivery.soundStatus,
      playedCount: delivery.playedCount,
      endReason: delivery.endReason,
    })),
    reply: row.reply
      ? {
          id: row.reply.id,
          deviceId: row.reply.deviceId,
          type: row.reply.type,
          text: row.reply.text,
          createdAt: row.reply.createdAt,
        }
      : null,
  };
}

function assertCurrent(row: Announcement | null): asserts row is Announcement {
  if (!row || !activeStatuses.includes(row.status)) {
    throw new BusinessError('ANNOUNCEMENT_ENDED', '该喊话已结束', 409);
  }
}

function assertDelivery(row: AnnouncementDelivery | null): asserts row is AnnouncementDelivery {
  if (!row) throw new BusinessError('ANNOUNCEMENT_DEVICE_FORBIDDEN', '该设备无权操作此喊话', 403);
}

export class AnnouncementsService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCleanup = 0;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(
      () => void this.tick().catch((error) => console.error('[Announcements] tick failed', error)),
      2_000,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // Browser voices vary. This is a conservative estimate, shown as an estimate in the UI.
  minimumSeconds(text: string, repeatCount: number): number {
    return Math.ceil((Array.from(text).length / 3) * repeatCount + 2 * (repeatCount - 1) + 3);
  }

  private async load(id: string): Promise<AnnouncementWithRelations> {
    const row = await prisma.announcement.findUnique({
      where: { id },
      include: { deliveries: true, reply: true },
    });
    if (!row) throw new BusinessError('ANNOUNCEMENT_NOT_FOUND', '喊话不存在', 404);
    return row;
  }

  async create(
    userId: string,
    classId: string,
    input: {
      mode: 'CUSTOM' | 'STUDENT';
      studentId?: string;
      text: string;
      repeatCount: number;
      durationSeconds: number;
      idempotencyKey: string;
    },
  ) {
    await studentsService.assertAccess(userId, classId);
    const previous = await prisma.announcement.findUnique({
      where: {
        teacherId_idempotencyKey: { teacherId: userId, idempotencyKey: input.idempotencyKey },
      },
      include: { deliveries: true, reply: true },
    });
    if (previous) {
      if (previous.classId !== classId)
        throw new BusinessError('ANNOUNCEMENT_KEY_REUSED', '请求标识已用于其他班级', 409);
      return detail(previous);
    }

    const body = input.text.trim();
    if (!body || Array.from(body).length > 100) {
      throw new BusinessError('ANNOUNCEMENT_TEXT_INVALID', '喊话内容应为 1～100 字', 400);
    }
    if (
      !Number.isInteger(input.repeatCount) ||
      input.repeatCount < 1 ||
      input.repeatCount > 5 ||
      !Number.isInteger(input.durationSeconds) ||
      input.durationSeconds < 10 ||
      input.durationSeconds > 180
    ) {
      throw new BusinessError('ANNOUNCEMENT_SETTINGS_INVALID', '播报次数或显示时间无效', 400);
    }
    if (input.mode === 'STUDENT' && !input.studentId) {
      throw new BusinessError('ANNOUNCEMENT_STUDENT_REQUIRED', '请选择学生', 400);
    }
    const [teacher, student] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
      input.mode === 'STUDENT'
        ? prisma.student.findFirst({
            where: { id: input.studentId, classId, status: 'ACTIVE', deletedAt: null },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);
    if (input.mode === 'STUDENT' && !student) {
      throw new BusinessError('ANNOUNCEMENT_STUDENT_INVALID', '学生已离班或不可用', 409);
    }
    const text = student ? `${student.name}，${body}` : body;
    const minimumSeconds = this.minimumSeconds(text, input.repeatCount);
    if (input.durationSeconds < minimumSeconds) {
      throw new BusinessError(
        'ANNOUNCEMENT_DURATION_SHORT',
        `按预估语速播报需要至少 ${minimumSeconds} 秒`,
        400,
      );
    }
    if (minimumSeconds > 180) {
      throw new BusinessError('ANNOUNCEMENT_DURATION_LONG', '请减少文字或播报次数', 400);
    }
    const onlineIds = realtimeService.getConnectedDisplayDeviceIds(classId);
    if (!onlineIds.length)
      throw new BusinessError('ANNOUNCEMENT_NO_DISPLAY', '大屏未连接，请连接后重试', 409);
    const devices = await prisma.displayDevice.findMany({
      where: { id: { in: onlineIds }, classId, status: 'ACTIVE' },
      orderBy: { id: 'asc' },
      select: { id: true, soundReady: true },
    });
    const primary = devices.find((device) => device.soundReady);
    if (!primary)
      throw new BusinessError('ANNOUNCEMENT_SOUND_NOT_READY', '请先在大屏启用声音', 409);

    try {
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.announcement.create({
          data: {
            classId,
            teacherId: userId,
            teacherName: teacher.name,
            studentId: student?.id ?? null,
            studentName: student?.name ?? null,
            mode: input.mode,
            text,
            repeatCount: input.repeatCount,
            durationSeconds: input.durationSeconds,
            idempotencyKey: input.idempotencyKey,
            primaryDeviceId: primary.id,
            deliveries: {
              create: devices.map((device) => ({
                deviceId: device.id,
                isPrimary: device.id === primary.id,
              })),
            },
          },
        });
        await tx.announcementLock.create({ data: { classId, announcementId: row.id } });
        return row.id;
      });
      publish(classId, created);
      return detail(await this.load(created));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const retried = await prisma.announcement.findUnique({
          where: {
            teacherId_idempotencyKey: { teacherId: userId, idempotencyKey: input.idempotencyKey },
          },
          include: { deliveries: true, reply: true },
        });
        if (retried) {
          if (retried.classId !== classId)
            throw new BusinessError('ANNOUNCEMENT_KEY_REUSED', '请求标识已用于其他班级', 409);
          return detail(retried);
        }
        throw new BusinessError('ANNOUNCEMENT_BUSY', '当前班级正在喊话，请稍后再试', 409);
      }
      throw error;
    }
  }

  async list(userId: string, classId: string) {
    await studentsService.assertAccess(userId, classId);
    const rows = await prisma.announcement.findMany({
      where: { classId, teacherId: userId, sentAt: { gte: new Date(Date.now() - RETAIN_MS) } },
      include: { deliveries: true, reply: true },
      orderBy: { sentAt: 'desc' },
      take: 20,
    });
    return rows.map(detail);
  }

  async get(userId: string, classId: string, id: string) {
    await studentsService.assertAccess(userId, classId);
    const row = await this.load(id);
    if (row.classId !== classId || row.teacherId !== userId) {
      throw new BusinessError('ANNOUNCEMENT_FORBIDDEN', '无权查看该喊话', 403);
    }
    return detail(row);
  }

  async current(deviceId: string, classId: string) {
    const delivery = await prisma.announcementDelivery.findFirst({
      where: { deviceId, announcement: { classId, status: { in: activeStatuses } } },
      include: { announcement: { include: { deliveries: true, reply: true } } },
      orderBy: { announcement: { sentAt: 'desc' } },
    });
    if (!delivery) return null;
    const row = delivery.announcement;
    if (!delivery.displayedAt && Date.now() > row.sentAt.getTime() + RECEIVE_MS) return null;
    if (
      delivery.displayedAt &&
      delivery.expiresAt &&
      delivery.expiresAt.getTime() <= Date.now() &&
      !delivery.inputUntil &&
      delivery.pausedRemainingMs === null
    )
      return null;
    return detail(row);
  }

  async setSoundReady(deviceId: string, ready: boolean) {
    await prisma.displayDevice.update({
      where: { id: deviceId },
      data: {
        soundReady: ready,
        soundReadyAt: ready ? new Date() : null,
      },
    });
    return { ready };
  }

  async displayed(deviceId: string, classId: string, id: string) {
    const row = await this.load(id);
    assertCurrent(row);
    if (row.classId !== classId)
      throw new BusinessError('ANNOUNCEMENT_FORBIDDEN', '无权访问该喊话', 403);
    const delivery = row.deliveries.find((item) => item.deviceId === deviceId) ?? null;
    assertDelivery(delivery);
    if (delivery.displayedAt) return detail(row);
    if (Date.now() > row.sentAt.getTime() + RECEIVE_MS) {
      throw new BusinessError('ANNOUNCEMENT_RECEIVE_EXPIRED', '喊话接收时间已过', 409);
    }
    const now = new Date();
    const accepted = await prisma.$transaction(async (tx) => {
      const active = await tx.announcement.findFirst({
        where: { id, status: { in: activeStatuses } },
        select: { id: true },
      });
      if (!active) throw new BusinessError('ANNOUNCEMENT_ENDED', '该喊话已结束', 409);
      const updated = await tx.announcementDelivery.updateMany({
        where: { id: delivery.id, displayedAt: null },
        data: {
          displayedAt: now,
          expiresAt: new Date(now.getTime() + row.durationSeconds * 1_000),
        },
      });
      if (updated.count)
        await tx.announcement.updateMany({
          where: { id, status: 'WAITING_DISPLAY' },
          data: { status: 'DISPLAYING', acknowledgedAt: now },
        });
      return updated.count;
    });
    if (accepted) publish(classId, id);
    return detail(await this.load(id));
  }

  async playback(
    deviceId: string,
    classId: string,
    id: string,
    status: 'PLAYING' | 'FAILED' | 'INTERRUPTED' | 'COMPLETED',
    playedCount: number,
  ) {
    const row = await this.load(id);
    if (row.classId !== classId)
      throw new BusinessError('ANNOUNCEMENT_FORBIDDEN', '无权访问该喊话', 403);
    const delivery = row.deliveries.find((item) => item.deviceId === deviceId) ?? null;
    assertDelivery(delivery);
    if (!delivery.isPrimary || !delivery.displayedAt)
      throw new BusinessError('ANNOUNCEMENT_DEVICE_FORBIDDEN', '该设备不是主播放设备', 403);
    if (activeStatuses.includes(row.status)) {
      await prisma.announcementDelivery.update({
        where: { id: delivery.id },
        data: {
          soundStatus: status,
          playedCount: Math.min(row.repeatCount, Math.max(delivery.playedCount, playedCount)),
        },
      });
      publish(classId, id);
    }
    return { accepted: true };
  }

  async input(deviceId: string, classId: string, id: string, action: 'START' | 'RETURN') {
    const row = await this.load(id);
    assertCurrent(row);
    if (row.classId !== classId)
      throw new BusinessError('ANNOUNCEMENT_FORBIDDEN', '无权访问该喊话', 403);
    const delivery = row.deliveries.find((item) => item.deviceId === deviceId) ?? null;
    assertDelivery(delivery);
    if (!delivery.displayedAt || !delivery.expiresAt)
      throw new BusinessError('ANNOUNCEMENT_NOT_DISPLAYED', '大屏尚未展示该喊话', 409);
    const now = Date.now();
    if (action === 'START') {
      if (delivery.pauseUsed || delivery.expiresAt.getTime() <= now)
        throw new BusinessError('ANNOUNCEMENT_PAUSE_USED', '输入时间已用完', 409);
      const changed = await prisma.announcementDelivery.updateMany({
        where: { id: delivery.id, pauseUsed: false },
        data: {
          pauseUsed: true,
          inputStartedAt: new Date(now),
          inputUntil: new Date(now + INPUT_MS),
          pausedRemainingMs: delivery.expiresAt.getTime() - now,
        },
      });
      if (!changed.count) throw new BusinessError('ANNOUNCEMENT_PAUSE_USED', '输入时间已用完', 409);
    } else if (delivery.inputUntil && delivery.pausedRemainingMs !== null) {
      const expiresAt = Math.min(now, delivery.inputUntil.getTime()) + delivery.pausedRemainingMs;
      if (expiresAt <= now) throw new BusinessError('ANNOUNCEMENT_ENDED', '该喊话已结束', 409);
      await prisma.announcementDelivery.update({
        where: { id: delivery.id },
        data: {
          expiresAt: new Date(expiresAt),
          inputUntil: null,
          pausedRemainingMs: null,
        },
      });
    }
    publish(classId, id);
    return detail(await this.load(id));
  }

  async reply(
    deviceId: string,
    classId: string,
    id: string,
    input: {
      type: 'QUICK' | 'CUSTOM';
      text?: string;
      idempotencyKey: string;
    },
  ) {
    const existing = await prisma.announcementReply.findUnique({
      where: { deviceId_idempotencyKey: { deviceId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      if (existing.announcementId !== id)
        throw new BusinessError('ANNOUNCEMENT_KEY_REUSED', '回复请求标识已使用', 409);
      return detail(await this.load(id));
    }
    const row = await this.load(id);
    assertCurrent(row);
    if (row.classId !== classId)
      throw new BusinessError('ANNOUNCEMENT_FORBIDDEN', '无权访问该喊话', 403);
    const delivery = row.deliveries.find((item) => item.deviceId === deviceId) ?? null;
    assertDelivery(delivery);
    const now = Date.now();
    const validInput = delivery.inputUntil && delivery.inputUntil.getTime() > now;
    if (
      !delivery.displayedAt ||
      (!validInput && (!delivery.expiresAt || delivery.expiresAt.getTime() <= now))
    ) {
      throw new BusinessError('ANNOUNCEMENT_ENDED', '该喊话已结束', 409);
    }
    const text = input.type === 'QUICK' ? '知道了' : (input.text?.trim() ?? '');
    if (!text || Array.from(text).length > 100)
      throw new BusinessError('ANNOUNCEMENT_REPLY_INVALID', '回复应为 1～100 字', 400);
    try {
      await prisma.$transaction(async (tx) => {
        const live = await tx.announcementDelivery.findUnique({ where: { id: delivery.id } });
        const acceptedAt = Date.now();
        if (
          !live?.displayedAt ||
          ((!live.inputUntil || live.inputUntil.getTime() <= acceptedAt) &&
            (!live.expiresAt || live.expiresAt.getTime() <= acceptedAt))
        ) {
          throw new BusinessError('ANNOUNCEMENT_ENDED', '该喊话已结束', 409);
        }
        const changed = await tx.announcement.updateMany({
          where: { id, status: 'DISPLAYING' },
          data: { status: 'REPLIED', endedAt: new Date(acceptedAt), endReason: 'REPLIED' },
        });
        if (!changed.count) throw new BusinessError('ANNOUNCEMENT_ENDED', '该喊话已结束', 409);
        await tx.announcementReply.create({
          data: {
            announcementId: id,
            deviceId,
            type: input.type,
            text,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await tx.announcementDelivery.updateMany({
          where: { announcementId: id, endReason: null },
          data: { endReason: 'REPLIED' },
        });
        await tx.announcementLock.deleteMany({ where: { classId, announcementId: id } });
      });
    } catch (error) {
      const retried = await prisma.announcementReply.findUnique({
        where: { deviceId_idempotencyKey: { deviceId, idempotencyKey: input.idempotencyKey } },
      });
      if (retried) {
        if (retried.announcementId !== id)
          throw new BusinessError('ANNOUNCEMENT_KEY_REUSED', '回复请求标识已使用', 409);
        return detail(await this.load(id));
      }
      throw error;
    }
    publish(classId, id);
    return detail(await this.load(id));
  }

  async end(userId: string, classId: string, id: string) {
    await studentsService.assertAccess(userId, classId);
    const row = await this.load(id);
    if (row.classId !== classId || row.teacherId !== userId)
      throw new BusinessError('ANNOUNCEMENT_FORBIDDEN', '无权结束该喊话', 403);
    if (activeStatuses.includes(row.status)) await this.finish(row, 'ENDED', 'TEACHER_ENDED');
    return detail(await this.load(id));
  }

  private async finish(
    row: Announcement,
    status: 'ENDED' | 'TIMED_OUT' | 'FAILED',
    reason: string,
  ) {
    const changed = await prisma.$transaction(async (tx) => {
      const result = await tx.announcement.updateMany({
        where: { id: row.id, status: { in: activeStatuses } },
        data: { status, endedAt: new Date(), endReason: reason },
      });
      if (result.count)
        await tx.announcementLock.deleteMany({
          where: { classId: row.classId, announcementId: row.id },
        });
      if (result.count)
        await tx.announcementDelivery.updateMany({
          where: { announcementId: row.id, endReason: null },
          data: { endReason: reason },
        });
      return result.count;
    });
    if (changed) publish(row.classId, row.id);
  }

  async tick() {
    const locks = await prisma.announcementLock.findMany({
      include: {
        announcement: { include: { deliveries: true } },
      },
    });
    const now = Date.now();
    for (const lock of locks) {
      const row = lock.announcement;
      if (!activeStatuses.includes(row.status)) {
        await prisma.announcementLock.deleteMany({
          where: { classId: lock.classId, announcementId: row.id },
        });
        continue;
      }
      if (row.status === 'WAITING_DISPLAY' && now > row.sentAt.getTime() + RECEIVE_MS) {
        await this.finish(row, 'FAILED', 'NO_DISPLAY_ACK');
        continue;
      }
      if (row.status !== 'DISPLAYING') continue;
      for (const delivery of row.deliveries) {
        if (
          delivery.inputUntil &&
          delivery.inputUntil.getTime() <= now &&
          delivery.pausedRemainingMs !== null
        ) {
          await prisma.announcementDelivery.updateMany({
            where: { id: delivery.id, inputUntil: delivery.inputUntil },
            data: {
              expiresAt: new Date(delivery.inputUntil.getTime() + delivery.pausedRemainingMs),
              inputUntil: null,
              pausedRemainingMs: null,
            },
          });
        }
      }
      const latest = await prisma.announcementDelivery.findMany({
        where: { announcementId: row.id },
      });
      if (
        latest.every(
          (delivery) =>
            !delivery.inputUntil && (!delivery.expiresAt || delivery.expiresAt.getTime() <= now),
        )
      ) {
        await this.finish(row, 'TIMED_OUT', 'DISPLAY_EXPIRED');
      }
    }
    if (now - this.lastCleanup > 60 * 60_000) {
      this.lastCleanup = now;
      await prisma.announcement.deleteMany({
        where: { endedAt: { lt: new Date(now - RETAIN_MS) }, status: { notIn: activeStatuses } },
      });
    }
  }
}

export const announcementsService = new AnnouncementsService();
