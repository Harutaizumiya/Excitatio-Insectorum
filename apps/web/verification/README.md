# 大屏 UI 开发验收

在项目根目录运行：

```powershell
pnpm --filter @repo/web dev --host 127.0.0.1 --port 4173 --strictPort
node --experimental-strip-types --test apps/web/verification/display-score-timeline.test.mjs
```

- 真实页面：`http://127.0.0.1:4173/display`。沿用现有本地 API（默认代理 `localhost:3000`），必须正常绑定设备。页面没有预置会话或绕过权限的入口。
- 模拟记录：`http://127.0.0.1:4173/verification/display-trends.html`。独立 Vite 开发入口，标题及班级标签明确标记模拟数据，未被生产入口导入；生产构建不输出此 HTML。
- 模拟页关闭抽屉后可选择历史不可用、全班无记录、班级边界不匹配，再重新打开。顾清和的期初为 0，选择“全部”验证百分比隐藏；苏沐晴没有流水，不能出现虚假走势。
- 图表按住拖动查看记录，松开恢复最新值；键盘左右键/Home/End 提供同样记录状态，移出焦点恢复。滚动条不会改变主图学生，支持暂停/继续和手动滚动。

## 生产数据边界

`/display/bootstrap` 仍负责座位、当前榜单和课表；已实现的 `GET /api/v1/display/score-trends` 仅接受有效大屏设备 token，并从 token 读取班级。响应按已保存的周期期初及现有每月 100 分默认期初回放真实积分流水（含撤销行），为当前 ACTIVE 名单计算历史均分。没有流水时不生成积分曲线。

“本学期”依赖服务端 `SCORE_TREND_TERM_START_DATE` / `SCORE_TREND_TERM_END_DATE` 两个 Asia/Taipei 日期环境变量；结束日按包含全天处理。当前确认日期为 `2026-09-01` 至 `2027-01-31`。部署环境必须设置这两个值；未设置时其他范围仍可用，“本学期”显示无学期数据。

`/verification/display-trends.html` 仍使用隔离模拟数据，只用于复验交互状态，不进入生产页面也不代替真实 API 联调。

## 2026-09-27 本地交接

- 工作树：`C:/Users/Haruta/.codex/worktrees/08d1/Excitatio-Insectorum`。
- 分支：`codex/display-score-trends`。
- 前端预览 `127.0.0.1:4173`，已有本地后端 `localhost:3000`。保持前端运行供最终验收。
- Edge 已通过正常绑定流程创建独立设备“积分大屏UI验收-4173”。因 IAB 截图持续超时，最初同名 IAB 测试设备已撤销并改在 Edge 绑定；原有 `test` 设备及 `:3001` 会话保留。验收完成后可在本地设备管理中撤销本次测试设备。
- 本地临时登录响应已删除，凭证未写入仓库。截图仅保存在本机临时目录，没有提交真实学生截图。
- 截图目录：`C:/Users/Haruta/AppData/Local/Temp/display-ui-verification/`。主屏 `main-api-1280.png`、`main-api-1920-final.png`；真实抽屉 `drawer-api-1280.png`、`drawer-api-1920.png`；记录浮层 `drawer-record-1280.png`；fixture 关闭状态 `fixture-closed-1280.png`。
- 1280×720：页面高 720；侧栏可视/内容高均 570；抽屉可视/内容高均 687，统计底部 704。1920×1080：页面高 1080；侧栏可视/内容高均 892；抽屉可视/内容高均 799，统计底部 1056。最终文件使用视口截图。

## 2026-09-27 原 UI 交接检查

- `pnpm --filter @repo/web typecheck`：通过。
- `pnpm --filter @repo/web lint`：通过。
- 上述 Node 测试：7/7 通过，覆盖台北时间边界、期初来源、空区间、非正期初、未来记录及按时间选记录。
- `pnpm --filter @repo/web build`：通过；已有管理页面 chunk 大于 500 kB 提示。
- 改动文件 Prettier 检查、`git diff --check`：通过。
- 浏览器已确认真实 98 分显示及历史降级、学生选择、区间空态、零期初百分比隐藏、键盘记录查询/恢复、关闭抽屉布局；原任务独立确认暂停和键盘记录状态。
- 没有运行根目录后端/数据库测试：本次没有修改这些包。没有宣称真机多指触控、实时点名中间动画或减少动态效果系统偏好经过完整端到端重测；已有实现保留，相关新增路径已做源码检查。

## 2026-09-29 历史 API 接入

- 大屏走势通过 `GET /api/v1/display/score-trends` 读取；服务端从设备 token 限定班级，返回当前 ACTIVE 学生的流水、期初与班均分时间序列。
- `SCORE_TREND_TERM_START_DATE=2026-09-01`、`SCORE_TREND_TERM_END_DATE=2027-01-31` 使用台北日历日期；目标部署环境需配置这两个值。
- 后端类型检查、前后端 lint、前端类型检查/build、49 项 server 测试及 8 项走势范围测试通过。隔离 SQLite 的 Elysia 路由联调验证设备 token、query 班级隔离、用户 token 拒绝、真实流水和班均分；没有访问或迁移旧默认数据库。

视觉问题与修复记录见项目根目录 `design-qa.md`。原任务于2026-09-27独立确认 UI 视觉验收通过；本轮历史数据 API 接入结果见上方 2026-09-29 记录。
