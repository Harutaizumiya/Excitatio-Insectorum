# 任务身份

你是本任务的独立执行 Worker。禁止创建任何后台任务、线程或子 Agent。

## 目标与位置

- 总目标：按 5 份 docs 实现后端 MVP。
- 子目标：完整实现版本化固定网格座位布局 API 与事务。
- 位置：基础验收后的业务阶段 C；上游 Skill：codex-model-routing-team。

## 交付物

- 产物：src/seating/** Module/Controller/Service/DTO/测试。
- 写入路径：仅 src/seating/**。
- 返回格式：结论、证据/变更、验证、风险。

## 边界

- 可读取整个项目；只写 seating 目录；禁止修改 Prisma、基础设施、AppModule、其他业务/docs/agent_team。
- 文件所有权：seating 唯一写入者；reserved slots 2。

## 背景与约束

- 实现 current layout、完整新版本保存、版本分页/列表、历史预览、restore 全部 API 与 Swagger。
- HEAD_TEACHER 才能保存/恢复/查看历史；任课教师仅当前布局只读；class scope 强制。
- 保存校验 cell 唯一、坐标 0-based 且在网格内、student 同班 ACTIVE 且不重复。保存必须在同一事务内分配单调 version、创建快照并切换 currentLayoutVersionId；支持 baseVersion 乐观并发并返回 409。
- restore 不覆盖历史：复制目标生成新版本，sourceVersionId 指向目标；事务 commit 后发布 SEAT_LAYOUT_CHANGED。并发 version 冲突要安全映射和/或有限重试，不得静默覆盖。

## 验收

- 完成标准：所有 Seat Layout 路由、验证、事务与事件顺序符合文档。
- 必须验证：重复 cell/student、越界、inactive/跨班学生、版本冲突、历史不可变、restore 来源和权限；运行 scoped 测试/tsc（可用时）。
- 缺失信息：报告，不猜测。
