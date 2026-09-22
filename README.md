<p align="center">
  <img src="apps/web/public/logo.png" alt="课序 logo" width="96" />
</p>

<h1 align="center">课序 · Excitatio Insectorum</h1>

<p align="center">
  面向课堂的座位管理、积分激励与实时班级大屏。
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2563eb.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22-339933.svg" alt="Node.js >=22" />
  <img src="https://img.shields.io/badge/pnpm-11.10.0-f69220.svg" alt="pnpm 11.10.0" />
</p>

## 功能

- 班主任后台：学生、座位、课程表、积分与大屏设备管理。
- 班级大屏：座位布局、课程信息、排名和实时状态展示。
- 实时同步：通过 Socket.IO 将座位、学生和课堂事件同步到大屏。
- 数据层：Prisma 支持 SQLite 本地开发与 PostgreSQL 部署。
- 前端只连接后端 API，后端不可用时会在页面显示错误提示。

## 技术栈

Vite 8 · React 19 · TypeScript · Elysia · Prisma · Ant Design · Tailwind CSS · shadcn/ui · TanStack Query · Socket.IO · Turborepo

## 快速开始

环境要求：Node.js `>=22`、pnpm `11.10.0`。

```bash
pnpm install
pnpm dev:fullstack
```

`pnpm dev:fullstack` 会准备本地 SQLite、生成 Prisma Client，在空数据库中写入演示数据，并同时启动 Elysia 后端和 Vite 前端。打开 [http://localhost:3001/login](http://localhost:3001/login)，使用 `zhangsha / admin123` 登录。

Windows 也可以双击 `scripts/start-dev.cmd` 一键启动。

## 启动本地全栈

默认使用 SQLite。先准备环境文件：

```powershell
Copy-Item .env.example apps/server-elysia/.env
```

前端由启动脚本配置为连接 `http://localhost:3000`。如需手动启动或使用其他后端端口，可在 `apps/web/.env.local` 中指定：

```env
VITE_API_ORIGIN=http://localhost:3311
```

推荐直接一键启动：

```powershell
pnpm dev:fullstack
```

如果需要手动分开启动：

```powershell
pnpm db:generate
pnpm db:migrate:deploy
pnpm --filter @repo/server-elysia seed
pnpm --filter @repo/server-elysia dev:node
pnpm --filter @repo/web dev
```

跳过数据库准备适合已完成初始化的本地环境：

```powershell
./scripts/start-dev.ps1 -SkipDatabase
```

SQLite 文件位于 `packages/database/prisma/sqlite/dev.db`。PostgreSQL 使用 `*:postgresql` 命令及 `packages/database/prisma/schema.prisma`。

## 项目结构

```text
apps/
├── web/       Vite 8 SPA 前端：后台、大屏与邀请页面
└── server-elysia/ Elysia API 与 Socket.IO 网关
packages/
├── database/  Prisma schema、迁移与数据库客户端
├── eslint-config/
└── typescript-config/
```

主要路由：

| 路由            | 用途         |
| --------------- | ------------ |
| `/admin`        | 班主任后台   |
| `/display`      | 班级大屏     |
| `/display/bind` | 大屏设备绑定 |
| `/teacher`      | 任课教师端   |

## 常用命令

```bash
pnpm dev          # 启动开发环境
pnpm build        # 构建所有包
pnpm lint         # ESLint 检查
pnpm typecheck    # TypeScript 检查
pnpm test         # 单元测试
pnpm format       # Prettier 格式化
```

后端 API 前缀为 `/api/v1`；启用 Swagger 后访问 `/api/docs`。

## Docker 镜像与部署

在仓库根目录构建：

```bash
docker build -f Dockerfile -t excitatio-insectorum-server:latest .
docker build -f Dockerfile.web -t excitatio-insectorum-web:latest .
```

- **前端镜像 (`Dockerfile.web`)**：基于多阶段构建的 `nginx:alpine` 镜像，SPA 静态产物位于 `/usr/share/nginx/html`，默认监听 `3001` 端口，已预设单页路由回退 `try_files $uri $uri/ /index.html;`。构建参数 `VITE_API_ORIGIN` 默认留空，直接使用同源相对路径配合反向代理。
- **后端镜像 (`Dockerfile`)**：仅安装 Elysia server / database 的生产依赖，保留 Prisma CLI、客户端、引擎和迁移文件。容器启动时先执行 SQLite 迁移，再启动 Elysia；数据库路径及 `deploy/docker-compose.yml` 中的持久化挂载保持不变。

生产环境通过 `deploy/server.env` 注入后端配置。

生产静态前端直接部署：

```bash
pnpm --filter @repo/web build
```

将构建产物 `apps/web/dist` 发布到 `/www/sites/excitatio-insectorum/static`（OpenResty / Nginx 静态站点根目录），并通过反向代理转发 `/api/` 与 `/socket.io/`（完整反代配置参考 [deploy/openresty/excitatio-insectorum.conf](deploy/openresty/excitatio-insectorum.conf)）。

检查磁盘占用和回收超过 24 小时未使用的构建缓存：

```bash
docker system df
docker builder prune --all --filter until=24h
```

该命令针对构建缓存，不删除应用镜像或数据库卷。近期构建缓存保留，方便后续增量构建。

## 文档

- [需求说明](docs/01-requirements.md)
- [后端架构](docs/03-backend-architecture.md)
- [API 设计](docs/04-api-design.md)
- [UI 设计](docs/06-ui-design.md)
- [后台与大屏测试手册](docs/07-manual-test-and-acceptance.md)

## License

[MIT](LICENSE)
