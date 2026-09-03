# Project Structure

## Overview

课序是面向班主任、任课教师和班级大屏的课堂管理应用。当前采用 pnpm workspace + Turborepo，前端为 Next.js 16 / React 19，后端为 NestJS 11 模块化单体，通过 REST API 与 Socket.IO 通信，Prisma 管理持久化。

本次以 2026-09-03 工作区（基准提交 `31b3cef`）为准。生产部署启动一个 NestJS 进程，由 OpenResty 托管 Next.js 静态导出产物；部署数据库配置使用 SQLite，另保留 PostgreSQL schema 和命令。前端当前 Provider 固定使用 API，部分旧说明中的默认 mock 模式已不符合实现。

## Modules

- 页面与导航：`apps/web/src/app` 提供登录、后台、教师端、大屏、绑定及邀请入口；`features/admin` 实现管理后台，`features/classroom` 实现课堂与大屏交互。
- 前端数据与状态：`apps/web/src/lib` 定义领域类型、ClassroomService、HTTP 请求、会话与实时客户端；`components/providers` 管理 TanStack Query、依赖注入和事件引起的查询失效。
- UI 与交互组件：`components/ui`、`components/shared` 及 feature 内组件提供表单、反馈、座位编辑和动画；后台使用 Refine / Ant Design，课堂端使用 Tailwind / shadcn/ui。
- 认证与访问控制：后端 `auth`、`users` 和 `common` 管理用户、JWT、刷新令牌轮换、邀请消费、身份类型、班级边界及角色权限。
- 班级与人员：`classrooms`、`teachers`、`students` 管理班级、教师关系与学生生命周期；学生导入模块处理 Excel / CSV 解析、校验和批量写入。
- 座位与课程：`seating` 管理完整座位版本、冲突校验和恢复；`schedules` 管理作息模板、课程格及变更事件。
- 积分与排名：`scores` 管理规则、流水、反向撤销记录、月度周期、业务事件、班委及结算；`ranking` 提供排名和公开展示数据。
- 课堂随机点名：`random-pick` 选择学生并发布课堂事件。
- 大屏设备：`displays` 管理绑定码、绑定会话、凭证、设备撤销及 bootstrap 聚合数据。
- 实时通信：`realtime` 校验连接身份、加入班级房间、定期复核连接权限，并在业务事务提交后广播事件；前端据此更新查询或重新读取状态。
- 基础设施与部署：`prisma`、`redis`、`config`、日志及统一异常处理中间件提供基础能力；`packages/database` 管理双数据库 schema 与迁移；Dockerfile 和 `deploy` 维护生产运行方式。

## Data Flow

浏览器页面通过 hooks / ClassroomService 调用 `/api/v1`；NestJS Guard 校验 JWT、身份类型、班级权限和角色，DTO / ValidationPipe 校验输入，Service 执行业务规则并通过 Prisma 读写数据库。成功响应通常使用 `{ data }` 或 `{ data, meta }`，错误响应使用 `{ code, message, requestId }`。

涉及积分、座位和人员等写入的业务在事务提交后向 RealtimeService 发布事件。Socket.IO 通过 `/socket.io/` 传输、使用 `/realtime` namespace，按班级房间分发。前端更新查询缓存或重新获取大屏 bootstrap，保留后端作为最终状态来源。

Redis 承载认证限流、绑定码和短期绑定会话；当前 RedisService 在连接失败后回退到进程内存。用户 Session、设备凭证及业务数据持久化在数据库中，内存回退不等于生产环境可以无条件取消 Redis。

## Next Steps

- 按 [轻量化迁移评估](architecture-lightweight-assessment.md) 优先精简镜像并评估前端静态部署。
- 修复或明确学生导入、设备绑定测试与当前数据库分支的预期差异，建立可用回归基线。
- 补齐真实 HTTP、浏览器和 Socket.IO 的关键流程验证，覆盖静态部署后的深链接、邀请、设备凭证续期和断线恢复。
- 同步 AGENTS.md 等说明与 API-only 前端、实际 SQLite 部署配置之间的差异。
