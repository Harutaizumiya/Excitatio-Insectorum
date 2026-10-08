import { Elysia, t } from 'elysia';
import { authPlugin } from '../../plugins/auth';
import { announcementsService } from './announcements.service';

const key = t.String({ minLength: 1, maxLength: 100 });

export const announcementsController = new Elysia()
  .use(authPlugin)
  .group('/classes/:classId/announcements', (app) =>
    app
      .get(
        '',
        async ({ user, params: { classId } }) => ({
          data: await announcementsService.list(user!.sub, classId),
        }),
        {
          requireUser: true,
          params: t.Object({ classId: t.String() }),
          detail: { tags: ['Announcements'] },
        },
      )
      .get(
        '/:id',
        async ({ user, params: { classId, id } }) => ({
          data: await announcementsService.get(user!.sub, classId, id),
        }),
        {
          requireUser: true,
          params: t.Object({ classId: t.String(), id: t.String() }),
          detail: { tags: ['Announcements'] },
        },
      )
      .post(
        '',
        async ({ user, params: { classId }, body }) => ({
          data: await announcementsService.create(user!.sub, classId, body),
        }),
        {
          requireUser: true,
          params: t.Object({ classId: t.String() }),
          body: t.Object({
            mode: t.Union([t.Literal('CUSTOM'), t.Literal('STUDENT')]),
            studentId: t.Optional(t.String()),
            text: t.String({ minLength: 1, maxLength: 100 }),
            repeatCount: t.Integer({ minimum: 1, maximum: 5 }),
            durationSeconds: t.Integer({ minimum: 10, maximum: 180 }),
            idempotencyKey: key,
          }),
          detail: { tags: ['Announcements'] },
        },
      )
      .post(
        '/:id/end',
        async ({ user, params: { classId, id } }) => ({
          data: await announcementsService.end(user!.sub, classId, id),
        }),
        {
          requireUser: true,
          params: t.Object({ classId: t.String(), id: t.String() }),
          detail: { tags: ['Announcements'] },
        },
      ),
  )
  .group('/display/announcements', (app) =>
    app
      .get(
        '/current',
        async ({ displayDevice }) => ({
          data: await announcementsService.current(displayDevice!.sub, displayDevice!.classId),
        }),
        { requireDisplayDevice: true, detail: { tags: ['Announcements'] } },
      )
      .post(
        '/sound',
        async ({ displayDevice, body }) => ({
          data: await announcementsService.setSoundReady(displayDevice!.sub, body.ready),
        }),
        {
          requireDisplayDevice: true,
          body: t.Object({ ready: t.Boolean() }),
          detail: { tags: ['Announcements'] },
        },
      )
      .post(
        '/:id/displayed',
        async ({ displayDevice, params: { id } }) => ({
          data: await announcementsService.displayed(
            displayDevice!.sub,
            displayDevice!.classId,
            id,
          ),
        }),
        {
          requireDisplayDevice: true,
          params: t.Object({ id: t.String() }),
          detail: { tags: ['Announcements'] },
        },
      )
      .post(
        '/:id/playback',
        async ({ displayDevice, params: { id }, body }) => ({
          data: await announcementsService.playback(
            displayDevice!.sub,
            displayDevice!.classId,
            id,
            body.status,
            body.playedCount,
          ),
        }),
        {
          requireDisplayDevice: true,
          params: t.Object({ id: t.String() }),
          body: t.Object({
            status: t.Union([
              t.Literal('PLAYING'),
              t.Literal('FAILED'),
              t.Literal('INTERRUPTED'),
              t.Literal('COMPLETED'),
            ]),
            playedCount: t.Integer({ minimum: 0, maximum: 5 }),
          }),
          detail: { tags: ['Announcements'] },
        },
      )
      .post(
        '/:id/input',
        async ({ displayDevice, params: { id }, body }) => ({
          data: await announcementsService.input(
            displayDevice!.sub,
            displayDevice!.classId,
            id,
            body.action,
          ),
        }),
        {
          requireDisplayDevice: true,
          params: t.Object({ id: t.String() }),
          body: t.Object({ action: t.Union([t.Literal('START'), t.Literal('RETURN')]) }),
          detail: { tags: ['Announcements'] },
        },
      )
      .post(
        '/:id/reply',
        async ({ displayDevice, params: { id }, body }) => ({
          data: await announcementsService.reply(
            displayDevice!.sub,
            displayDevice!.classId,
            id,
            body,
          ),
        }),
        {
          requireDisplayDevice: true,
          params: t.Object({ id: t.String() }),
          body: t.Object({
            type: t.Union([t.Literal('QUICK'), t.Literal('CUSTOM')]),
            text: t.Optional(t.String({ maxLength: 100 })),
            idempotencyKey: key,
          }),
          detail: { tags: ['Announcements'] },
        },
      ),
  );
