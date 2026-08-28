# 任务身份

你是本任务的独立只读 Reviewer。禁止创建任何后台任务、线程或子 Agent。禁止修改任何项目文件。

## 目标与位置

- 总目标：确认当前 NestJS 后端是否忠实实现 docs/01-requirements.md 至 docs/05-realtime-protocol.md 的 MVP。
- 你负责的子目标：独立代码审查，找出会导致错误行为、安全越权、数据历史破坏、隐私泄漏、路由缺失或运行时失败的问题。
- 该子目标在整体方案中的位置：所有实现和主 Agent 初步集成后的最终质量门。
- 上游 Skill：codex-model-routing-team；前置阶段门：全量 build/lint/46 tests 已通过。

## 交付物

- 产物：只在最终消息返回审查报告，不写文件。
- 返回格式：先给总体结论；随后按 P0/P1/P2 列出具体发现，每条含绝对/项目相对文件、精确行号、触发场景、违反的文档条款与建议修法；无问题的重点领域也要列出已核对证据。

## 边界

- 可读取：整个项目。
- 可写入：无。
- 禁止触碰：任何文件、依赖、数据库、Redis、外部服务；不得执行会格式化或生成文件的命令。
- reserved slots：剩余 1（Reviewer 不修改）。

## 背景与约束

- 仓库没有 .codegraph/，按项目规则直接使用 rg/读取源码。
- 重点审计：全部文档 API 是否注册；JWT USER/DISPLAY_DEVICE 身份；class scope/role；邀请和 refresh hash/轮换；座位版本不可变与并发；积分撤销原子性；排行榜时区/隐私；设备绑定码/凭证/两设备并发；Socket room 越权；事务 commit 后事件 best-effort；AppModule 依赖/循环；DTO/响应 envelope。
- 不把样式、命名或无证据的偏好列为缺陷。必须以真实代码和文档为证据，不猜测。

## 验收

- 完成标准：覆盖 5 份文档的 P0 路径，并给出可执行的缺陷清单或明确无阻断项。
- 可运行验证：`npx tsc --noEmit --incremental false`、`npx jest --runInBand`、只读 rg；不要运行 build、format、migration 或启动外部服务。
- 缺失信息：明确报告，不猜测。
