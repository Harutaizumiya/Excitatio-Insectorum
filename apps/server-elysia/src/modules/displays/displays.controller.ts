import { Elysia, t } from 'elysia';
import { prisma } from '../../plugins/prisma';
import { authPlugin } from '../../plugins/auth';
import { BusinessError } from '../../plugins/error-handler';
import { displaysService } from './displays.service';

async function verifyHeadTeacher(classId: string, userId: string) {
  const link = await prisma.classTeacher.findFirst({
    where: {
      classId,
      teacherId: userId,
      status: 'ACTIVE',
      role: 'HEAD_TEACHER',
    },
  });
  if (!link) {
    throw new BusinessError('FORBIDDEN_ROLE', '仅班主任有权管理大屏设备', 403);
  }
}

function getClientAddress(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

export const displaysController = new Elysia()
  .use(authPlugin)
  .group('/display', (app) =>
    app
      .post(
        '/auth/token',
        async ({ body }) => {
          const data = await displaysService.exchangeCredential(body.deviceId, body.credential);
          return { data };
        },
        {
          body: t.Object({
            deviceId: t.String(),
            credential: t.String(),
          }),
          detail: {
            summary: '使用长期设备凭证换取短期 DISPLAY_DEVICE access token',
            tags: ['Display'],
          },
        },
      )
      .get(
        '/bootstrap',
        async ({ displayDevice }) => {
          const data = await displaysService.getBootstrap(
            displayDevice!.sub,
            displayDevice!.classId,
          );
          return { data };
        },
        {
          requireDisplayDevice: true,
          detail: {
            summary: '获取大屏完整初始状态',
            tags: ['Display'],
            security: [{ 'access-token': [] }],
          },
        },
      )
      .post(
        '/binding-codes',
        async ({ request }) => {
          const data = await displaysService.createBindingCode(getClientAddress(request));
          return { data };
        },
        {
          detail: {
            summary: '创建 5 分钟有效的六位大屏绑定码',
            tags: ['Display Binding'],
          },
        },
      )
      .post(
        '/binding-sessions/:bindingSessionId/poll',
        async ({ params: { bindingSessionId }, body }) => {
          const data = await displaysService.pollBindingSession(bindingSessionId, body.nonce);
          return { data };
        },
        {
          params: t.Object({
            bindingSessionId: t.String(),
          }),
          body: t.Object({
            nonce: t.String(),
          }),
          detail: {
            summary: '由大屏轮询并一次性领取长期设备凭证',
            tags: ['Display Binding'],
          },
        },
      )
      .post(
        '/bind-by-code',
        async ({ body, request }) => {
          const data = await displaysService.bindDisplayByCode(body, getClientAddress(request));
          return { data };
        },
        {
          body: t.Object({
            code: t.String(),
          }),
          detail: {
            summary: '大屏端输入 6 位绑定码完成注册并获取凭证',
            tags: ['Display Binding'],
          },
        },
      ),
  )
  .group('/classes/:classId/display-devices', (app) =>
    app
      .post(
        '/binding-code',
        async ({ user, params: { classId }, body, request }) => {
          await verifyHeadTeacher(classId, user!.sub);
          const data = await displaysService.createClassroomBindingCode(
            classId,
            body,
            getClientAddress(request),
          );
          return { data };
        },
        {
          requireUser: true,
          params: t.Object({
            classId: t.String(),
          }),
          body: t.Object({
            name: t.String({ minLength: 1, maxLength: 50 }),
          }),
          detail: {
            summary: '班主任在后台生成 10 分钟有效的大屏绑定码',
            tags: ['Display Devices'],
            security: [{ 'access-token': [] }],
          },
        },
      )
      .get(
        '/binding-sessions/:sessionId',
        async ({ user, params: { classId, sessionId } }) => {
          await verifyHeadTeacher(classId, user!.sub);
          const data = await displaysService.getClassroomBindingSessionStatus(classId, sessionId);
          return { data };
        },
        {
          requireUser: true,
          params: t.Object({
            classId: t.String(),
            sessionId: t.String(),
          }),
          detail: {
            summary: '查询大屏绑定会话状态',
            tags: ['Display Devices'],
            security: [{ 'access-token': [] }],
          },
        },
      )
      .post(
        '/bind',
        async ({ user, params: { classId }, body, request }) => {
          await verifyHeadTeacher(classId, user!.sub);
          const data = await displaysService.bindDevice(
            classId,
            body,
            user!.sub,
            getClientAddress(request),
          );
          return { data };
        },
        {
          requireUser: true,
          params: t.Object({
            classId: t.String(),
          }),
          body: t.Object({
            code: t.String(),
            name: t.String({ minLength: 1, maxLength: 50 }),
          }),
          detail: {
            summary: '班主任使用绑定码绑定大屏',
            tags: ['Display Devices'],
            security: [{ 'access-token': [] }],
          },
        },
      )
      .get(
        '',
        async ({ user, params: { classId } }) => {
          await verifyHeadTeacher(classId, user!.sub);
          const data = await displaysService.listDevices(classId);
          return { data };
        },
        {
          requireUser: true,
          params: t.Object({
            classId: t.String(),
          }),
          detail: {
            summary: '列出本班大屏设备及最近在线状态',
            tags: ['Display Devices'],
            security: [{ 'access-token': [] }],
          },
        },
      )
      .post(
        '/:deviceId/revoke',
        async ({ user, params: { classId, deviceId } }) => {
          await verifyHeadTeacher(classId, user!.sub);
          const data = await displaysService.revokeDevice(classId, deviceId);
          return { data };
        },
        {
          requireUser: true,
          params: t.Object({
            classId: t.String(),
            deviceId: t.String(),
          }),
          detail: {
            summary: '吊销大屏及其全部长期凭证',
            tags: ['Display Devices'],
            security: [{ 'access-token': [] }],
          },
        },
      ),
  );
