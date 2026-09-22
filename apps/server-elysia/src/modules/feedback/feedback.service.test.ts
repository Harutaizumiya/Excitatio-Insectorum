import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient, UsageClientType, FeedbackType } from '@prisma/client';
import { BusinessError } from '../../plugins/error-handler';
import { FeedbackService } from './feedback.service';

test('subject teachers cannot list feedback management data', async () => {
  const service = new FeedbackService({
    classTeacher: { findFirst: async () => ({ role: 'SUBJECT_TEACHER' }) },
  } as unknown as PrismaClient);
  await assert.rejects(
    service.list('class-1', 'teacher-1', {}),
    (error: unknown) => error instanceof BusinessError && error.code === 'FORBIDDEN_ROLE',
  );
});

test('teacher feedback cannot impersonate the display client', async () => {
  const service = new FeedbackService({
    classTeacher: { findFirst: async () => ({ role: 'HEAD_TEACHER' }) },
  } as unknown as PrismaClient);
  await assert.rejects(
    service.create('class-1', 'teacher-1', {
      type: FeedbackType.BUG,
      description: '页面无法加载',
      clientType: UsageClientType.DISPLAY,
    }),
    (error: unknown) => error instanceof BusinessError && error.code === 'FEEDBACK_CLIENT_INVALID',
  );
});

test('feedback description rejects whitespace-only content', async () => {
  const service = new FeedbackService({
    classTeacher: { findFirst: async () => ({ role: 'HEAD_TEACHER' }) },
  } as unknown as PrismaClient);
  await assert.rejects(
    service.create('class-1', 'teacher-1', {
      type: FeedbackType.BUG,
      description: '   ',
      clientType: UsageClientType.ADMIN_WEB,
    }),
    (error: unknown) =>
      error instanceof BusinessError && error.code === 'FEEDBACK_DESCRIPTION_REQUIRED',
  );
});
