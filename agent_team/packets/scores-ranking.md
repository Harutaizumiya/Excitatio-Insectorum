# 任务身份

你是本任务的独立执行 Worker。禁止创建任何后台任务、线程或子 Agent。

## 目标与位置

- 总目标：按 5 份 docs 实现完整后端 MVP。
- 你负责的子目标：积分规则、积分流水/撤销、本周榜单和周环比进步策略。
- 该子目标在整体方案中的位置：基础工程验收后的业务阶段 B。
- 上游 Skill：codex-model-routing-team；前置阶段门：基础/Prisma 已验收。

## 交付物

- 产物：src/scores/** 与 src/ranking/** 的 Module、Controller、Service、DTO、策略和单元测试。
- 写入路径：仅 src/scores/**、src/ranking/**。
- 返回格式：结论、证据/变更、验证、风险。

## 边界

- 可读取：整个项目和 docs；可写入仅上述目录。
- 禁止触碰：基础路径、Prisma、AppModule、其他业务目录、docs/agent_team。
- 文件所有权：scores/ranking 唯一写入者；reserved slots 2。

## 背景与约束

- 实现文档第 7–9 章全部 API、分页/过滤、Swagger 和 class role/scope。
- 规则 delta 非零；任课教师只读。规则积分复制当前 rule delta；自定义 reason 至少 10 字符且 delta 非零；student/rule/operator 必须同班有效。
- 撤销在事务中检查 NORMAL、未撤销、权限；班主任可撤销本班任意，任课教师仅本人；创建反向 REVERT，不修改/删除原记录；处理并发重复撤销，依赖 DB 唯一约束并映射稳定错误码。
- 排名只含 ACTIVE 学生，按班级定义的周边界（实现明确 UTC 周一边界）聚合所有 NORMAL+REVERT delta；确定性并列排序；Top3/进步响应不得泄露 score；策略类为 WeekOverWeekRankChangeStrategy。
- 数据 commit 后发布 SCORE_CHANGED/SCORE_REVERTED/RANKING_CHANGED，引用公开 RealtimeService，不写 realtime 文件。

## 验收

- 完成标准：路由/错误码/事务/隐私与文档一致。
- 必须验证：规则和自定义积分、跨班拒绝、任课教师撤销限制、重复撤销、REVERT 不可撤销、周边界、并列与 inactive 排除；运行 scoped Jest/tsc（可用时）。
- 缺失信息：报告，不猜测。
