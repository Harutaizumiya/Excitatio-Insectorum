# 任务身份

你是本任务的独立执行 Worker。禁止创建任何后台任务、线程或子 Agent。

## 目标与位置

- 总目标：按 5 份 docs 实现后端 MVP。
- 子目标：实现 Realtime Gateway/事件服务、大屏绑定与认证/bootstrap、随机点名。
- 位置：基础验收后的业务阶段 D；上游 Skill：codex-model-routing-team。

## 交付物

- 产物：src/realtime/**、src/displays/**、src/random-pick/** 及测试。
- 写入路径：仅上述三个目录。
- 返回格式：结论、证据/变更、验证、风险。

## 边界

- 可读取整个项目；仅写交付路径；禁止基础/Prisma/AppModule/其他业务/docs/agent_team。
- 文件所有权：上述目录唯一写入者；reserved slots 2。

## 背景与约束

- Realtime namespace `/realtime`，JWT handshake 鉴权；DISPLAY_DEVICE 只能加入 token class，USER 只可加入有效 ClassTeacher 的 class；room `class:{id}`；统一 envelope 与 7 个事件类型；业务仅调用 RealtimeService，不直接访问 Gateway。
- 连接设备时更新 lastSeenAt，并按 30–60s 节流；事件发布失败不得回滚已提交业务。
- 实现绑定码创建（6 位、5 分钟 Redis TTL、rate limit 可通过 Nest Throttler）、班主任 bind/list/revoke、DeviceCredential hash-only、每班最多 2 个 ACTIVE 且事务并发安全、设备 credential 换短 access token。
- 文档未完整定义大屏安全取回绑定凭证的轮询端点：不得把 credential 返回给班主任 bind 响应；实现基于 bindingSessionId+nonce 的安全轮询端点，写 Swagger 并在交付中标明这个必要补全。
- `/display/bootstrap` 从设备 token 获取 classId，返回班级/当前座位/top3/progress且不含 score。随机点名只从 ACTIVE 且未排除学生随机，空候选稳定错误；commit/查询后发布 RANDOM_PICKED，duration 8000ms，MVP 不持久化。

## 验收

- 完成标准：API、Gateway、隐私、hash、2 设备上限、TTL/一次消费、class room 安全符合文档。
- 必须验证：未绑定/已吊销设备、错误 credential、第三设备并发、绑定码过期/重复、bootstrap 不泄露分数、Socket 越权、random exclude/空候选；运行 scoped 测试/tsc（可用时）。
- 缺失信息：报告，不猜测。
