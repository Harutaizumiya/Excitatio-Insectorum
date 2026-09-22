# @repo/server-elysia

活动后端服务，使用 Elysia + Node.js + Prisma + Socket.IO。

## 本地命令

```bash
pnpm --filter @repo/server-elysia dev:node
pnpm --filter @repo/server-elysia typecheck
pnpm --filter @repo/server-elysia lint
pnpm --filter @repo/server-elysia test
pnpm --filter @repo/server-elysia build
```

默认 API 前缀为 `/api/v1`，Swagger 为 `/api/docs`，Socket.IO namespace 为
`/realtime`。HTTP 成功 Envelope、业务错误 `{ code, message, requestId }`、JWT
claims、Prisma schema 和数据库迁移历史与前端契约保持一致。

## 迁移边界

- Elysia 负责活动构建、开发启动和 Docker 生产入口。
- 生产环境必须配置真实 `DATABASE_URL`、Redis 和随机 JWT/device secrets；开发环境才允许 Redis 内存回退。
- 切换前需要按 `docs/07-manual-test-and-acceptance.md` 验证登录、邀请、积分、座位、设备绑定、Socket.IO 断线恢复和大屏隐私字段。
