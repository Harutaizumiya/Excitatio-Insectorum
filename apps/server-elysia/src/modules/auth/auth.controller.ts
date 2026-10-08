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
  .get(
    '/invitations/:token/preview',
    async ({ params: { token } }) => {
      const data = await authService.getInvitationPreview(token);
      return { data };
    },
    {
      params: t.Object({
        token: t.String(),
      }),
      detail: {
        summary: '预览任课教师邀请信息',
        tags: ['Auth'],
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
  )
  .post('/wechat/login', async ({ body }) => ({ data: await authService.wechatLogin(body.code) }), {
    body: t.Object({ code: t.String({ minLength: 1, maxLength: 256 }) }),
    detail: { summary: '微信小程序登录或获取绑定状态', tags: ['Auth'] },
  })
  .post(
    '/wechat/bind',
    async ({ body }) => ({
      data: await authService.bindWechatIdentity(body.ticket, body.token),
    }),
    {
      body: t.Object({
        ticket: t.String({ minLength: 1, maxLength: 256 }),
        token: t.String({ minLength: 1, maxLength: 256 }),
      }),
      detail: { summary: '将微信身份绑定到受邀教师账号', tags: ['Auth'] },
    },
  )
  .get(
    '/wechat/invitations/:token/preview',
    async ({ params: { token } }) => ({
      data: await authService.getWechatInvitationPreview(token),
    }),
    {
      params: t.Object({ token: t.String({ minLength: 1, maxLength: 256 }) }),
      detail: { summary: '预览小程序教师绑定邀请', tags: ['Auth'] },
    },
  );
