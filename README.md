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

Next.js 16 · React 19 · TypeScript · NestJS · Prisma · Ant Design · Tailwind CSS · shadcn/ui · TanStack Query · Socket.IO · Turborepo

## 快速开始

环境要求：Node.js `>=22`、pnpm `11.10.0`。

```bash
pnpm install
pnpm --filter @repo/server dev
pnpm --filter @repo/web dev
```

打开 [http://localhost:3001/login](http://localhost:3001/login)。前端需要后端服务可用。

## 启动本地全栈

默认使用 SQLite。先准备环境文件：

```powershell
Copy-Item .env.example apps/server/.env
```

在 `apps/web/.env.local` 中设置后端地址：

```env
NEXT_PUBLIC_API_ORIGIN=http://localhost:3000
```

然后分别启动数据库、后端和前端：

```bash
pnpm db:generate
pnpm db:migrate:deploy
pnpm --filter @repo/server seed
pnpm --filter @repo/server dev
pnpm --filter @repo/web dev
```

SQLite 文件位于 `packages/database/prisma/sqlite/dev.db`。PostgreSQL 使用 `*:postgresql` 命令及 `packages/database/prisma/schema.prisma`。

## 项目结构

```text
apps/
├── web/       Next.js 前端：后台、大屏与邀请页面
└── server/    NestJS API 与 Socket.IO 网关
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

## 文档

- [需求说明](docs/01-requirements.md)
- [后端架构](docs/03-backend-architecture.md)
- [API 设计](docs/04-api-design.md)
- [UI 设计](docs/06-ui-design.md)
- [后台与大屏测试手册](docs/07-manual-test-and-acceptance.md)

## License

[MIT](LICENSE)
