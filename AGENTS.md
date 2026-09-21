# Excitatio Insectorum 开发协作规范

## 项目概况

- 这是一个 pnpm + Turborepo monorepo，要求使用 Node.js `>=22` 和 pnpm `11.10.0`。
- `apps/web`（`@repo/web`）是 Vite 8 + React 19 SPA 前端。
- `apps/server-elysia`（`@repo/server-elysia`）是唯一的 Elysia REST API 和 Socket.IO 网关。
- `packages/database`（`@repo/database`）维护 Prisma schema、迁移和共享数据库客户端；`packages/typescript-config` 与 `packages/eslint-config` 提供共享配置。
- 前端路由分工：`/admin/*` 班主任后台，`/teacher/*` 任课教师端，`/display/*` 班级大屏，`/invite/*` 邀请页，`/display/bind` 大屏绑定页。

## 开发与验证

- 安装依赖：`pnpm install`。
- 常用命令：`pnpm dev`、`pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm format:check`。
- 修改代码后，至少运行与改动范围对应的 lint、typecheck 或测试；涉及跨包改动时运行根目录命令。
- 需要数据库客户端时运行 `pnpm db:generate`；默认本地数据库是 SQLite。PostgreSQL 使用带 `:postgresql` 后缀的脚本，不要混用两套生成结果。
- 前端默认 `VITE_DATA_MODE=mock`，联调后端时切换为 `api` 并配置 `VITE_API_ORIGIN`；不要为了本地页面直接绕过现有 service/repository 抽象。
- 后端 API 前缀是 `/api/v1`，Swagger（启用时）位于 `/api/docs`，Socket.IO 使用 `/realtime` namespace。
- 不要重置、覆盖或删除用户已有的未提交修改；只修改当前任务涉及的文件。

## 架构约定

- 前端按 `app`、`features`、`components`、`lib` 分层；业务逻辑放在对应 feature 或 service 中，通用 UI 放在 `components/ui` 或 `components/shared`。
- `@tanstack/react-query` 管理 server state；页面局部交互、座位编辑草稿、弹窗/Sheet 和大屏显示模式使用 client state。
- `/admin/*` 遵循 Refine + Ant Design 的管理后台模式；`/teacher/*` 遵循移动优先、Tailwind + shadcn/ui 的课堂操作模式；`/display/*` 遵循远距离可读、低干扰和隐私保护原则。
- 后端按领域模块组织（auth、classrooms、students、teachers、seating、scores、ranking、schedules、random-pick、realtime 等）。Controller 处理协议和权限入口，Service 承担业务规则，DTO 负责输入校验。
- 跨领域写操作使用 Prisma transaction；事务成功后再发布 realtime 事件，不能广播可能已回滚的数据。
- API 具体 Schema 和响应以 Elysia Swagger/OpenAPI 与前端契约为准；修改接口时同步更新校验、测试和相关前端 service。
- SQLite schema 由 `packages/database/scripts/sync-sqlite-schema.mjs` 从 canonical schema 同步，修改数据库模型时检查两套 schema、迁移和生成流程。

## UI 与交互规范

- **严禁在 UI 中出现多余的描述。** 每段文案都必须直接帮助用户完成当前任务；删除重复标题、无行动价值的解释、装饰性提示和实现细节。优先使用清晰的标题、按钮、状态和必要错误信息。
- 管理后台强调清晰、高信息密度和低学习成本；危险操作必须二次确认。
- 教师端强调单手操作和少层级；主要点击目标至少 `44×44px`，常用操作尽量在 1～2 次点击内完成。
- 大屏使用大字号、高对比和短动画；不得展示学生具体积分、总分、负分次数或倒数排名，避免泄露不必要的个人信息。
- 加载、空状态和错误状态使用现有共享组件与页面模式；错误反馈要说明下一步行动，不重复堆叠背景说明。
- 优先复用现有组件、tokens、hooks、service 和 query key；新增抽象前先确认已有实现不能满足需求。
- 页面文案、交互和响应式行为以 `docs/06-ui-design.md` 为基线；若实际代码与文档不一致，先判断是否为有意变更，再同步必要文档。

## 数据、权限与实时性

- 路由层只负责导航体验，最终权限必须由后端 guard 和业务层控制；不能仅依赖前端隐藏按钮实现权限。
- 学生、座位、积分和设备等数据必须遵守班级边界；不要接受客户端任意指定 display 的 `classId`，以服务端 token 为准。
- 座位布局保存是完整版本提交；拖拽期间保留前端草稿，保存成功后再更新服务端版本。
- 积分撤销必须遵守操作者权限并防止重复撤销；自定义积分必须保持非零 delta 和现有原因长度校验。
- 实时事件应通过现有 realtime service/provider 处理，并在事件影响查询数据时使对应 TanStack Query 缓存失效。
- Secret、数据库连接串和生产环境配置不得提交到 Git；以 `.env.example` 和运行环境注入配置为准。

## 修改流程

1. 先阅读相关 feature、service、DTO、测试和设计文档，确认现有接口和数据流。
2. 优先做范围最小、符合现有分层的修改；不要为了局部需求重构无关架构。
3. 修改 API 或数据库时，同时检查调用方、mock、类型、迁移和 realtime 行为。
4. 完成后运行对应验证命令，并在结果中说明未运行的检查及原因。
