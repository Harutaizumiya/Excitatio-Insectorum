# 积分周期结算：全量切换至 croner 定时任务

## 1. 背景与目标

当前积分周期结算采用「懒式自动结算 + 手动兜底」两条路径：

- 懒式自动：`ensureCurrentPeriod()` 在每次正常访问（加分、查汇总、大屏取数）时，顺带把已到期但仍为 `OPEN` 的周期结算掉。
- 手动兜底：`POST /api/v1/classes/:classId/score-periods/settle` 供班主任主动触发 `settleBeforeCurrent()` / `settlePeriod()`。

缺陷：一个班级跨月后若完全无人访问系统，到期的周期不会自动变成 `SETTLED`，只能靠手动接口补。

本次目标：**移除懒式自动结算与手动兜底接口，结算全部交由 croner 定时任务统一驱动**，按班级遍历结算所有到期周期，并标记为「系统自动结算」。

## 2. 当前状态分析（触点点位）

以下为本项目结算相关的全部触点（基于本次探索，无其它单元测试覆盖结算逻辑）：

| 文件 | 位置 | 作用 | 本次处理 |
|---|---|---|---|
| `apps/server-elysia/src/modules/scores/score-periods.service.ts` | `ensureCurrentPeriod` L56 | 创建当前月周期 + **自动结算**过期周期 | 删除（结算逻辑移除，仅保留周期物化） |
| 同上 | `ensurePeriodForDate` L68 | 按日期物化周期（含 backfill），**不结算** | 保留，作为唯一周期物化入口 |
| 同上 | `settleBeforeCurrent` L100 | 手动兜底驱动 | 删除 |
| 同上 | `settlePeriod` L110 | 单周期结算（事务 + 幂等） | 保留，供 cron 调用 |
| 同上 | `getCurrentSummary`/`getSummary` | 查汇总时经 `ensureCurrentPeriod` | 改为经 `ensurePeriodForDate`，不再结算 |
| `apps/server-elysia/src/modules/scores/score-events.service.ts` | L81-82 | 记分时先物化周期 | 删除 L81 冗余的 `ensureCurrentPeriod`，仅保留 L82 |
| `apps/server-elysia/src/modules/scores/scores.service.ts` | L144, L197 | `createFromRule`/`createCustom` 取当前周期 | 改调 `ensurePeriodForDate(new Date())` |
| `apps/server-elysia/src/modules/displays/displays.service.ts` | L335 | 大屏取数 | 不变（`getCurrentSummaryForDisplay` 本身不结算） |
| `apps/server-elysia/src/modules/scores/scores.controller.ts` | L304-318 | 手动 `/score-periods/settle` 路由 | 删除 |
| `apps/server-elysia/src/route-contract.test.ts` | L12,L17 | 路线数与 settle 断言 | 数量 62，删 L17 |
| `apps/server-elysia/src/index.ts` | 启动 | 挂载服务 | 在此启动 cron job（`NODE_ENV!=='test'` 块内） |
| `apps/server-elysia/src/config.ts` | — | 运行时配置 | 新增 `scoreSettlementCron` |
| `apps/server-elysia/package.json` | deps | 依赖 | 新增 `croner` |
| 前端 `apps/web/src/lib/classroom-service.ts` | L133 | 接口声明 | 删除 `settleScorePeriods` |
| 前端 `apps/web/src/lib/api-classroom-service.ts` | L193-194, L704 | 实现 + 权限描述 | 删除 |
| 前端 `apps/web/src/lib/domain.ts` | L362 `settledAt` | 周期视图字段 | **保留**（仍为周期数据） |
| `docs/*`（04-api-design / api-reference 等含 settle 描述） | — | 文档 | 同步删除/更新 |

## 3. 关键决策（已与用户确认）

1. **操作者处理**：班级与班主任在系统设计中是**一对一**关系。cron 结算时取出该班当前有效班主任作为操作者（`operatorId` = 班主任 id），并**标记为系统自动结算**（在 `scoreEvent.parameters` 中写入 `sourceSystem: true`），以区别于教师手动行为。无有效班主任时按防御性逻辑记录 warn 并跳过（不影响整批）。
2. **移除范围**：**一并移除**手动结算接口 `POST /score-periods/settle`（后端路由、route-contract 断言、前端 `settleScorePeriods` 接口与实现全部删除），结算完全交给 cron。

## 4. 立项依据（为什么 croner 可行）

croner（https://github.com/hexagon/croner）：
- 支持 Node ≥18 与 Bun ≥1，本项目 Node ≥22，且 `app.ts` 已做 Bun/Node 双适配，均兼容。
- 支持 `timezone`（结算月边界正是台北时区自然月）。
- 支持异步函数、`protect`（防重入 overrun protection）、`catch`（错误处理）、TS 类型、0 依赖。
- 幂等性由现有 `businessKey` 唯一约束 + `SETTLED` 状态判断 + 全事务保障，cron 与懒触发重叠也不会重复加分（懒触发将移除）。

## 5. 具体改动

### 5.1 依赖
- `apps/server-elysia/package.json`：dependencies 新增 `"croner": "^10.0.0"`（用 `pnpm --filter @repo/server-elysia add croner` 安装）。

### 5.2 配置 `config.ts`
- interface `AppConfig` 新增 `scoreSettlementCron: string`。
- 实现：`scoreSettlementCron: process.env.SCORE_SETTLEMENT_CRON || '0 0 1 * *'`。

### 5.3 `score-periods.service.ts`
- **删除** `ensureCurrentPeriod`（含其自动结算循环 L56-66）。
- **删除** `settleBeforeCurrent`。
- 新增公开方法：
  ```ts
  async settleAllDuePeriods(now: Date = new Date()): Promise<{ settled: number; skipped: number; failed: number }>
  ```
  实现：
  1. `SELECT DISTINCT classId` from `scorePeriod` where `classId`, `status = OPEN`, `endAt <= now`；
  2. 对每个 classId 查该班当前有效 `HEAD_TEACHER`（`classTeacher.status = ACTIVE, role = HEAD_TEACHER`）；无则 `skipped++` 并 console.warn，继续；
  3. 遍历该班所有 `OPEN` 且 `endAt <= now` 的周期，逐个 `await this.settlePeriod(classId, period.id, headTeacherId)`，用 `try/catch` 隔离，失败 `failed++` 并记录错误（对象含 classId/periodId/error）；
  4. 返回统计供 cron 日志。
- 更新 `settlePeriod`：在 `NO_VIOLATION_REWARD` 与 `COMMITTEE_REWARD` 两个 `scoreEvent.create` 的 `parameters` JSON 中追加 `sourceSystem: true`（标记系统自动结算，字段在事件 JSON 内，无需改库表）。
- `getCurrentSummary(classId)`：改为 `ensurePeriodForDate(classId, new Date())`，签名去掉 `operatorId`。
- `getSummary(classId, from?, to?)`：改为 `ensurePeriodForDate(classId, new Date())`，签名去掉 `operatorId`。
- 其余私有方法（`getOrCreatePeriod`/`backfillLegacyRecords`/`buildSummary`/`rank`/`toPeriodView`/`parseRange`/`findSettlementOperator`/`publishSettlement`）保持不变。

### 5.4 新增 cron job：`apps/server-elysia/src/modules/scores/score-settlement.job.ts`
```ts
import { Cron } from 'croner';
import { config } from '../../config';
import { scorePeriodsService } from './score-periods.service';

export function startScoreSettlementJob(): Cron {
  return new Cron(
    config.scoreSettlementCron,
    { name: 'score-period-settlement', timezone: 'Asia/Taipei', protect: true, catch: (err) => console.error('[score-settlement] job error', err) },
    async () => {
      const result = await scorePeriodsService.settleAllDuePeriods();
      console.log(`[score-settlement] done settled=${result.settled} skipped=${result.skipped} failed=${result.failed}`);
    },
  );
}
```
- 默认 `0 0 1 * *`（每月 1 日 00:00，Asia/Taipei）——届时上一自然月已结束，符合 `getTaipeiMonthPeriod` 与 `endAt <= now` 的判定。`protect:true` 防止上一轮未跑完又触发；`catch` 兜住整体异常。

### 5.5 启动挂载 `index.ts`
- 在 `NODE_ENV !== 'test'` 块内（`server.listen` 前后均可）调用 `startScoreSettlementJob()`，确保测试环境不启 cron（沿用现有测试隔离约定）。顶部引入该 job。

### 5.6 `score-events.service.ts`
- 删除 L81 `await scorePeriodsService.ensureCurrentPeriod(classId, operatorId);`，仅保留 L82 `ensurePeriodForDate(classId, occurredAt)`。

### 5.7 `scores.service.ts`
- L144、L197：`const period = await scorePeriodsService.ensureCurrentPeriod(classId, operatorId)` → `const period = await scorePeriodsService.ensurePeriodForDate(classId, new Date())`。

### 5.8 `scores.controller.ts`
- 删除 `.post('/score-periods/settle', ...)` 块（L304-318）。
- 更新 `getCurrentSummary` 调用：`scorePeriodsService.getCurrentSummary(classId)`（去 operator）。
- 更新 `getSummary` 调用：`scorePeriodsService.getSummary(classId, query.from, query.to)`（去 operator）。
- 确认 `TeacherRole` import 若不再被使用需移除（视清理后判断）。

### 5.9 `route-contract.test.ts`
- 删除 L17 settle 断言；`routes.size` 由 `63` 改为 `62`。

### 5.10 前端清理
- `apps/web/src/lib/classroom-service.ts`：删除 `settleScorePeriods` 接口声明（L133）。
- `apps/web/src/lib/api-classroom-service.ts`：删除权限描述分支（L193-194）与方法实现 `settleScorePeriods`（L704 起）。
- 已确认前端无组件调用 `settleScorePeriods`（仅定义处），删除安全。

### 5.11 文档同步
- 用 `Grep 'score-periods/settle|settleScorePeriods|懒结算|自动结算' docs` 定位并更新 `docs/04-api-design.md`、`docs/api-reference.md`（若含 settle 接口描述则删除），并补充「结算由服务器定时任务每月初自动执行」的说明。比例适中，不改无关内容。

## 6. 假设与约束

- 班级与班主任一对一为既成系统设计，cron 据此直接取班主任；无匹配时跳过（防御）而非中断。
- cron 为单实例进程内调度；当前部署为单实例，因幂等（businessKey 唯一 + SETTLED 判断）即使与任何并发也无重复加分。多副本时需另行加「仅 leader 执行」或 DB 锁，不在本次范围。
- 结算规则（`roleBonus`、无违规 +10、团支书任务联动、试用期过滤）全部保持不变，仅触发方式由懒结算改为 cron。
- 移除手动接口后，班主任不再能按需提前结算周期；周期一旦跨月，统一由下一月 1 日的 cron 结算。

## 7. 验证步骤

1. `pnpm --filter @repo/server-elysia add croner`；确认依赖安装。
2. `pnpm --filter @repo/server-elysia typecheck`
3. `pnpm --filter @repo/server-elysia lint`
4. `pnpm --filter @repo/server-elysia test`（route-contract 数量 62，删 settle 断言后通过）
5. 前端（因改动公共接口）：`pnpm --filter @repo/web typecheck` / `lint`
6. 逻辑抽查：确认 `settleAllDuePeriods` 只结算 `OPEN && endAt <= now` 的周期；`sourceSystem:true` 已写入两种系统事件的 `parameters`。
7. （可选）手动触发 `job.trigger()` 或在 getter/记分路径观察，确认过一个已到期周期后其状态变为 `SETTLED` 且无重复事件。