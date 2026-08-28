# 任务身份

你是本任务的独立执行 Worker。禁止创建任何后台任务、线程或子 Agent。

## 目标与位置

- 总目标：依据 docs/01-requirements.md 至 docs/05-realtime-protocol.md 实现完整 NestJS 后端 MVP。
- 你负责的子目标：创建可编译的基础工程、完整 Prisma 数据模型和共享基础设施。
- 该子目标在整体方案中的位置：阶段 1，后续三个业务 Worker 的唯一前置阶段门兼健康探针。
- 上游 Skill：codex-model-routing-team。
- 上游阶段：耐久模式/基础工程。
- 前置阶段门：无；仓库当前只有 docs/ 与 agent_team/。

## 交付物

- 产物：NestJS/TypeScript 工程配置、Prisma schema、Docker 开发依赖、Config、Prisma、Redis、Common、Swagger/日志/异常/鉴权共享类型等基础设施。
- 写入路径：package.json、tsconfig*.json、nest-cli.json、eslint/prettier/jest 配置、.env.example、Dockerfile、docker-compose.yml、prisma/**、src/main.ts、src/app.module.ts、src/config/**、src/prisma/**、src/redis/**、src/common/**。
- 返回格式：结论、证据/变更、验证、风险。

## 边界

- 可读取：docs/**、agent_team/**、整个当前项目的已有文件。
- 可写入：仅上面列出的基础路径。
- 禁止触碰：src/auth、src/users、src/classrooms、src/teachers、src/students、src/scores、src/ranking、src/seating、src/displays、src/realtime、src/random-pick；docs/**；其他 Worker 文件。
- 文件所有权：你是基础路径的唯一写入者；后续 app.module.ts 会由主 Agent 在你完成后串行集成。
- reserved slots：2（由主 Agent记录，Worker 不修改）。

## 背景与约束

- 已知事实：技术栈是 Node.js、TypeScript、NestJS、Prisma/PostgreSQL、Passport/JWT、Socket.IO、Redis、Swagger、Pino、Docker；模块化单体；REST/DB 是事实源，实时事件仅通知。
- 用户偏好：严格依文档，不猜接口；所有时间 UTC；Token/设备凭证/邀请只持久化 hash。
- 关键约束：Prisma schema 必须覆盖文档全部实体与关系，处理 Classroom/currentLayout 的双向关系、ScoreRecord 自引用撤销唯一性、Session、DeviceCredential、TeacherInvitation；不要依赖真实数据库即可完成静态验证。所有文件编辑使用 apply_patch，不使用 shell 重定向创建文件。
- 与其他 Worker 的接口：导出可复用的 PrismaService、RedisService、BusinessException、JWT principal/claims、角色与 class-scope guards/decorators、Realtime 发布接口占位（若放 common）。不要实现业务模块。

## 验收

- 完成标准：npm scripts 和依赖齐全；`npx prisma validate` 与 TypeScript build 在依赖可用时可运行；配置校验能在启动时发现缺失环境变量；异常响应符合 `{code,message,requestId}`；Swagger base `/api/v1` 和 docs 配置已准备。
- 必须运行的验证：至少检查 package JSON、Prisma schema 格式和 TypeScript 静态结构；若 node_modules 不存在或网络受限，明确报告未运行项，禁止伪造结果。
- 缺失信息时的处理：报告缺口，不猜测。
