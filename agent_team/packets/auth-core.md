# 任务身份

你是本任务的独立执行 Worker。禁止创建任何后台任务、线程或子 Agent。

## 目标与位置

- 总目标：依据 docs/01-requirements.md 至 docs/05-realtime-protocol.md 实现完整 NestJS 后端 MVP。
- 你负责的子目标：实现用户认证、班级、教师邀请/关系与学生管理 API。
- 该子目标在整体方案中的位置：基础工程验收后的业务阶段 A。
- 上游 Skill：codex-model-routing-team；上游阶段：后端业务实现。
- 前置阶段门：基础工程和 Prisma schema 已由主 Agent 验收。

## 交付物

- 产物：完整 Controller/Service/DTO/Module 及针对关键权限和事务规则的单元测试。
- 写入路径：src/auth/**、src/users/**、src/classrooms/**、src/teachers/**、src/students/**及其同目录测试。
- 返回格式：结论、证据/变更、验证、风险。

## 边界

- 可读取：整个项目；重点是 5 份 docs、prisma/schema.prisma、src/common/**。
- 可写入：仅交付路径。
- 禁止触碰：package/config、prisma/**、src/main.ts、src/app.module.ts、src/common/**、其他业务目录、docs/**、agent_team/**。
- 文件所有权：上述五个业务目录唯一写入者；AppModule 由主 Agent集成。
- reserved slots：2（Worker 不修改）。

## 背景与约束

- 实现文档的 `/api/v1/auth/*`、`/classes*`、学生和教师全部端点；Swagger 装饰器与 DTO 校验齐全。
- 登录仅允许有效用户，argon2 hash 校验；access/refresh token；Session 中只存 refresh hash并轮换；logout 可吊销。
- 教师邀请原文只返回一次，数据库只存 hash，24h/配置化过期，消费一次且事务化；邀请创建的任课教师初始 account/password 数据应遵循既有 Prisma schema，若文档有欠定义，以最小安全实现并明确风险。
- 所有 class 端点用 Guard + service 双重校验 scope/role；班主任独占写操作；教师 revoke 同时吊销关联 sessions；学生 deactivate 保留历史并在事务中解除当前布局的 studentId，成功后发布 STUDENT_CHANGED（依赖 `../realtime/realtime.service` 的公开契约，不写 realtime 文件）。
- 网格缩小时若当前布局有越界 Seat，返回 409。

## 验收

- 完成标准：所有指定路由存在；hash/轮换/一次性消费/权限作用域实现；无 `any` 逃避关键类型；不伪造接口。
- 必须运行的验证：对本目录运行 TypeScript/Jest（可用时），至少覆盖邀请重复消费、refresh rotation、跨班级拒绝、任课教师写操作拒绝、学生停用。
- 缺失信息时的处理：先查文档和现有基础接口；仍缺失则报告，不猜测。
