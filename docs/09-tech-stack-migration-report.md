# 技术栈清理与数据库迁移评估

日期：2026-09-16  
分支：`codex/pr-1-integration`  
范围：当前分支清理、远端数据库只读拉取、本地迁移演练、代码验证和本地镜像构建。未修改线上服务、线上数据库、OpenResty 配置或部署编排。

## 结论

当前分支已收敛为一套运行架构：

| 层           | 当前实现                                                        |
| ------------ | --------------------------------------------------------------- |
| 包管理与编排 | pnpm 11.10.0 + Turborepo                                        |
| 前端         | `apps/web`：Vite 8 + React 19 + React Router 静态 SPA           |
| 后端         | `apps/server-elysia`：Elysia + Node.js + Prisma + Socket.IO     |
| 数据库       | `packages/database`：Prisma SQLite，保留 PostgreSQL schema/脚本 |
| 生产入口     | OpenResty 提供前端静态文件，并代理 `/api/v1` 与 `/socket.io/`   |

已从当前分支移除旧源码和旧构建产物：`apps/server`、`apps/web-next`、`apps/web/out`、`apps/web/next-env.d.ts`。workspace 和 lockfile 已重新生成，活动范围为 `apps/web`、`apps/server-elysia` 与共享 `packages/*`。构建、测试和 Dockerfile 均只指向当前架构。

## 远端数据库快照

通过 SSH 只读复制服务器上的 SQLite 文件到本地临时目录：

`C:\Users\Haruta\AppData\Local\Temp\excitatio-insectorum-20260916\server-dev.db`

- 远端路径：`/opt/1panel/www/sites/excitatio-insectorum/data/sqlite/dev.db`
- SHA-256：`706e018396da31a0de0fb696e7823721b0ed0482562d5f6d621acf61f79cd320`
- 远端与本地校验值一致；数据库 `integrity_check` 为 `ok`
- 远端已应用 4 条迁移：`20260830054809_init`、`20260901000000_add_class_schedule`、`20260902000000_add_monthly_score_system`、`20260903000000_add_student_soft_delete`

本地复制品另存为 `migration-rehearsal.db`，使用当前 SQLite schema 执行 `migrate deploy`：成功新增 `20260911000000_add_usage_analytics_feedback`。演练库再次通过完整性检查，并确认 `UsageEvent`、`Feedback` 表存在；未对远端数据库执行迁移。

## 当前分支验证

已完成：

- `pnpm --filter @repo/database db:generate`：通过
- `pnpm typecheck`：通过，5 个 workspace package
- `pnpm lint`：通过，3 个任务
- `pnpm test`：通过，Elysia 测试 20/20，无失败
- `pnpm build`：通过，Elysia 后端和 Vite 前端均产出构建物

测试覆盖健康检查、认证响应、邀请预览、遥测、反馈、分析、排名、积分事件摘要和版本化 HTTP 路由面。Redis 未在本机启动时使用了项目已有的回退告警；这不等同于生产 Redis、多实例 Socket.IO 和真实浏览器验收。

Vite 构建仍提示 `admin-pages` 约 685 kB 的压缩后 chunk，属于性能优化项，不阻断构建。

## 镜像构建状态

仓库中的 `Dockerfile` 已构建 `apps/server-elysia/dist/index.js`，`Dockerfile.web` 已构建 `apps/web/dist`。Docker Desktop daemon 已就绪，本地两个镜像均构建成功：后端镜像约 668 MB，前端镜像约 107 MB。

使用的构建命令为：

```powershell
docker build -f Dockerfile -t excitatio-insectorum-server:latest .
docker build --build-arg VITE_API_ORIGIN=https://seat.haruta.top -f Dockerfile.web -t excitatio-insectorum-web:latest .
```

本地临时容器验证通过：后端容器发现 5 条迁移且无待迁移，`/api/v1/health` 和 `/api/docs` 均返回 200；前端容器的 `/`、`/display`、`/admin` 均返回 200 并正确回退到 `index.html`。验证使用本地迁移演练库，容器已清理。

## 迁移评估

代码和数据库迁移风险为中低：当前数据库只需要执行一条新增的、可回滚前备份的增量迁移，数据完整性已在本地副本验证；前后端协议仍使用 `/api/v1` 和 Socket.IO `/realtime`。

实际生产切换风险为中高，原因是服务器当前仍运行旧发布物：远端 compose 的启动命令仍引用 `apps/server/dist/main.js`，静态目录中的页面仍引用旧构建资源。正式发布前必须生成并上传新镜像/静态产物，更新部署编排和 OpenResty 静态根目录，然后按“备份 SQLite → 停止旧实例 → 启动新实例并执行迁移 → 健康检查 → 登录/积分/座位/大屏验收 → 保留回滚点”的顺序执行。

服务器当前磁盘约 86% 使用、内存约 1.8 GiB；不建议在服务器上安装依赖或现场构建镜像，应在本地或 CI 构建后上传。线上 Redis、Socket.IO 多实例行为、真实账号权限和浏览器深链接仍需要发布窗口验收。

本轮没有执行远端迁移、重启、配置写入、镜像发布或服务切换。
