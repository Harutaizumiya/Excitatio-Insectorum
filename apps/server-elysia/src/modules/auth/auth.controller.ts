import { Elysia, t } from 'elysia';
import { authService } from './auth.service';
import { authPlugin } from '../../plugins/auth';

export const authController = new Elysia({ prefix: '/auth' })
  .use(authPlugin)
  .post(
    '/login',
    async ({ body }) => {
      const data = await authService.login(body.account, body.password);
      return { data };
    },
    {
      body: t.Object({
        account: t.String(),
        password: t.String(),
      }),
      detail: {
        summary: '账号密码登录',
        tags: ['Auth'],
      },
    },
  )
  .post(
    '/refresh',
    async ({ body }) => {
      const data = await authService.refresh(body.refreshToken);
      return { data };
    },
    {
      body: t.Object({
        refreshToken: t.String(),
      }),
      detail: {
        summary: '轮换 Refresh Token',
        tags: ['Auth'],
      },
    },
  )
  .post(
    '/logout',
    async ({ user }) => {
      if (user?.sub && user.sessionId) {
        await authService.logout(user.sub, user.sessionId);
      }
      return { data: { loggedOut: true } };
    },
    {
      requireUser: true,
      detail: {
        summary: '吊销当前登录会话',
        tags: ['Auth'],
        security: [{ 'access-token': [] }],
      },
    },
  )
  .post(
    '/invitations/:token/consume',
    async ({ params: { token }, body }) => {
      const data = await authService.consumeInvitation(token, body?.deviceName);
      return { data };
    },
    {
      params: t.Object({
        token: t.String(),
      }),
      body: t.Optional(
        t.Object({
          deviceName: t.Optional(t.String()),
        }),
      ),
      detail: {
        summary: '一次性消费任课教师邀请',
        tags: ['Auth'],
      },
    },
  );
