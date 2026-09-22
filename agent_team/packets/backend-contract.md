# 任务身份

你是本任务的独立执行 Worker。禁止创建任何后台任务、线程或子 Agent。

## 目标与位置

- 总目标：根据 `docs/课序：使用状况分析与用户反馈功能 PRD.md` 完成第一阶段 MVP。
- 你负责的子目标：实现后端统一事件、反馈、班级使用分析的数据模型与 Elysia API，并补充聚焦测试。
- 该子目标在整体方案中的位置：第一阶段门；你的 API 与类型将供后续前端实现使用。
- 上游 Skill：无。
- 上游阶段：无。
- 前置阶段门：无。

## 交付物

- 产物：Prisma canonical/SQLite schema 与迁移、`apps/server-elysia` 对应模块、路由注册、输入校验、权限与测试。
- 写入路径：`packages/database/**`、`apps/server-elysia/**`；如契约需要，可修改 `apps/web/src/lib/domain.ts` 和 `apps/web/src/lib/classroom-service.ts`，但优先只在后端完成并返回契约。
- 返回格式：结论、证据/变更、API 契约、验证、风险。

## 边界

- 可读取：全仓库、PRD、AGENTS.md、`.codegraph/`。
- 可写入：上述交付路径。
- 禁止触碰：`apps/web/src/components/providers/backend-unavailable-alert.tsx`、`apps/web/src/features/admin/seating/seat-cell.tsx`、`apps/web/src/features/classroom/display-surface.tsx`、`apps/web/src/lib/api-error.ts`、`apps/web/src/lib/realtime.ts`、`README.md`、`package.json`、`scripts/**`、`docs/课序：使用状况分析与用户反馈功能 PRD.md`；这些存在用户未提交修改。
- 文件所有权：你独占 `packages/database/**` 和新建的 `apps/server-elysia/src/modules/analytics/**`、`feedback/**`、`telemetry/**`；修改公共 `app.ts` 时只做注册所需最小改动。
- reserved slots：2，由主 Agent 记录，Worker 不修改。

## 背景与约束

- 已知事实：活动后端是 Elysia；API 前缀 `/api/v1`；已有 `BusinessError` 和 requestId；大屏使用设备 token；教师权限按班级关系和 `TeacherRole` 控制；当前工作区有未提交改动。
- 用户偏好：先查真实调用链，最小改动，中文 UI/错误文案简洁，验证与声明相称。
- 关键约束：先用 CodeGraph；统一事件模型 + 少量 JSON 扩展属性；不得存学生姓名、学号、积分原因或自由文本业务内容；采集失败不影响核心业务；反馈描述是用户主动提交内容，可长期保存；不执行迁移；不提交/推送。
- 与其他 Worker 的接口：稳定返回事件上报、反馈创建/列表/详情/更新、班级分析摘要的路径、请求/响应类型和权限规则。若当前没有全局系统管理员角色，不新增一套角色；先提供班级边界内的 HEAD_TEACHER 管理能力，并明确产品级全局视图缺口。

## 验收

- 完成标准：PRD 必须项中可由后端承载的事件、反馈状态流转、聚合指标、隐私字段约束和 Trace ID 均有真实实现；SQLite/canonical schema 同步；端点有鉴权和班级边界。
- 必须运行的验证：数据库生成/同步相关检查（不执行迁移）、目标包 typecheck、相关单元/集成测试、`git diff --check`；若命令受当前环境阻塞，记录原始错误。
- 缺失信息时的处理：报告缺口，不猜测。

