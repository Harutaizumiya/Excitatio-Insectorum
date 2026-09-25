import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

test('announcements are class locked, idempotent, and accept only the first assigned display reply', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'excitatio-announcements-test-'));
  const databasePath = resolve(directory, 'announcements.db');
  const databaseUrl = `file:${databasePath.replace(/\\/g, '/')}`;
  const packageRoot = resolve(process.cwd(), '../../packages/database');
  execFileSync(
    process.execPath,
    [
      resolve(packageRoot, 'scripts/run-sqlite-prisma.mjs'),
      'migrate',
      'deploy',
      '--schema',
      'prisma/sqlite/schema.prisma',
    ],
    { cwd: packageRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' },
  );
  process.env.DATABASE_URL = databaseUrl;

  const { prisma } = await import('../../plugins/prisma');
  const { announcementsService } = await import('./announcements.service');
  const { realtimeService } = await import('../realtime/realtime.service');
  const originalOnline = realtimeService.getConnectedDisplayDeviceIds;
  try {
    const classroom = await prisma.classroom.create({ data: { name: '一班' } });
    const teacher = await prisma.user.create({
      data: { name: '王老师', account: 'teacher-a', passwordHash: 'test' },
    });
    const otherTeacher = await prisma.user.create({
      data: { name: '李老师', account: 'teacher-b', passwordHash: 'test' },
    });
    await prisma.classTeacher.createMany({
      data: [
        { classId: classroom.id, teacherId: teacher.id, role: 'HEAD_TEACHER' },
        { classId: classroom.id, teacherId: otherTeacher.id, role: 'SUBJECT_TEACHER' },
      ],
    });
    const student = await prisma.student.create({ data: { classId: classroom.id, name: '张三' } });
    const otherClass = await prisma.classroom.create({ data: { name: '二班' } });
    const otherStudent = await prisma.student.create({
      data: { classId: otherClass.id, name: '越班学生' },
    });
    const primary = await prisma.displayDevice.create({
      data: { classId: classroom.id, name: '屏幕一', soundReady: true },
    });
    const secondary = await prisma.displayDevice.create({
      data: { classId: classroom.id, name: '屏幕二' },
    });
    const outsider = await prisma.displayDevice.create({
      data: { classId: classroom.id, name: '离线屏幕' },
    });
    realtimeService.getConnectedDisplayDeviceIds = () => [primary.id, secondary.id];

    const input = {
      mode: 'STUDENT' as const,
      studentId: student.id,
      text: '请到办公室',
      repeatCount: 2,
      durationSeconds: 30,
      idempotencyKey: 'request-a',
    };
    await assert.rejects(
      announcementsService.create(teacher.id, classroom.id, {
        ...input,
        studentId: otherStudent.id,
        idempotencyKey: 'cross-class',
      }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ANNOUNCEMENT_STUDENT_INVALID',
    );
    const first = await announcementsService.create(teacher.id, classroom.id, input);
    assert.equal(first.text, '张三，请到办公室');
    assert.equal(first.status, 'WAITING_DISPLAY');
    assert.equal((await announcementsService.create(teacher.id, classroom.id, input)).id, first.id);
    await assert.rejects(
      announcementsService.create(otherTeacher.id, classroom.id, {
        ...input,
        idempotencyKey: 'request-b',
      }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ANNOUNCEMENT_BUSY',
    );
    await assert.rejects(
      announcementsService.displayed(outsider.id, classroom.id, first.id),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ANNOUNCEMENT_DEVICE_FORBIDDEN',
    );
    await announcementsService.displayed(primary.id, classroom.id, first.id);
    await announcementsService.displayed(secondary.id, classroom.id, first.id);
    const replied = await announcementsService.reply(secondary.id, classroom.id, first.id, {
      type: 'QUICK',
      idempotencyKey: 'reply-a',
    });
    assert.equal(replied.status, 'REPLIED');
    assert.equal(replied.reply?.text, '知道了');
    assert.equal(
      (
        await announcementsService.reply(secondary.id, classroom.id, first.id, {
          type: 'QUICK',
          idempotencyKey: 'reply-a',
        })
      ).reply?.id,
      replied.reply?.id,
    );
    await assert.rejects(
      announcementsService.reply(primary.id, classroom.id, first.id, {
        type: 'CUSTOM',
        text: '稍后到',
        idempotencyKey: 'reply-b',
      }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ANNOUNCEMENT_ENDED',
    );
    assert.equal(await prisma.announcementLock.count({ where: { classId: classroom.id } }), 0);

    const simultaneous = await Promise.allSettled([
      announcementsService.create(teacher.id, classroom.id, {
        ...input,
        idempotencyKey: 'simultaneous-a',
      }),
      announcementsService.create(otherTeacher.id, classroom.id, {
        ...input,
        idempotencyKey: 'simultaneous-b',
      }),
    ]);
    assert.equal(simultaneous.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(simultaneous.filter((result) => result.status === 'rejected').length, 1);
    const accepted = simultaneous.find((result) => result.status === 'fulfilled');
    assert.ok(accepted);
    const rejected = simultaneous.find((result) => result.status === 'rejected');
    assert.ok(rejected);
    assert.equal((rejected.reason as { code?: string }).code, 'ANNOUNCEMENT_BUSY');
    await announcementsService.displayed(primary.id, classroom.id, accepted.value.id);
    const inputting = await announcementsService.input(
      primary.id,
      classroom.id,
      accepted.value.id,
      'START',
    );
    assert.equal(
      inputting.deliveries.find((item) => item.deviceId === primary.id)?.pauseUsed,
      true,
    );
    await assert.rejects(
      announcementsService.input(primary.id, classroom.id, accepted.value.id, 'START'),
    );
    const resumed = await announcementsService.input(
      primary.id,
      classroom.id,
      accepted.value.id,
      'RETURN',
    );
    assert.equal(resumed.deliveries.find((item) => item.deviceId === primary.id)?.inputUntil, null);
    const custom = await announcementsService.reply(primary.id, classroom.id, accepted.value.id, {
      type: 'CUSTOM',
      text: '张三不在教室',
      idempotencyKey: 'custom-reply',
    });
    assert.equal(custom.reply?.text, '张三不在教室');
  } finally {
    realtimeService.getConnectedDisplayDeviceIds = originalOnline;
    await prisma.$disconnect();
    delete process.env.DATABASE_URL;
    unlinkSync(databasePath);
    rmdirSync(directory);
  }
});
