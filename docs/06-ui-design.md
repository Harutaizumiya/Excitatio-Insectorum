# 06 UI 设计与前端页面规格

## 1. 文档目的

本文档定义 Classroom System MVP 的前端信息架构、页面结构、核心组件、交互规则、响应式策略和视觉约束。

目标：

- 班主任后台：清晰、稳定、高信息密度。
- 任课教师移动端：课堂中快速、单手完成积分和随机点名。
- 班级大屏：远距离可读、低干扰、实时反馈、保护隐私。
- 座位编辑器：固定网格约束，避免自由画布复杂度。
- 为 React + TypeScript 前端开发提供统一实现基线。

## 2. 前端技术基线

```text
Vite
React
TypeScript
Refine Core
Ant Design
Tailwind CSS
shadcn/ui
TanStack Query
React Hook Form
Zod
dnd-kit
Socket.IO Client
```

页面分工：

```text
/admin/*      班主任后台，Refine + Ant Design
/teacher/*    任课教师移动端，Tailwind + shadcn/ui
/display/*    班级大屏，自定义 UI
/invite/*     任课教师邀请页
/display/bind 大屏首次绑定页
```

## 3. 全局信息架构

```text
Classroom System
│
├── 班主任后台 /admin
│   ├── 班级概览
│   ├── 学生管理
│   ├── 座位管理
│   ├── 任课教师
│   ├── 积分规则
│   ├── 积分流水
│   └── 大屏设备
│
├── 任课教师移动端 /teacher
│   ├── 课堂快捷操作
│   ├── 随机点名
│   └── 最近操作 / 积分流水
│
├── 大屏 /display
│   ├── 班级座位
│   ├── Top3
│   ├── 进步趋势
│   └── 本地视图切换
│
├── 任课教师邀请 /invite/:token
└── 大屏绑定 /display/bind
```

## 4. 全局视觉原则

### 4.1 班主任后台

关键词：

```text
稳定
清晰
高信息密度
低学习成本
标准管理后台
```

原则：

- 使用 Ant Design 标准控件。
- 以表格、表单、Drawer、Modal 为主要交互模式。
- 核心管理操作保持显式。
- 危险操作使用二次确认。
- 页面优先适配桌面 1280px 及以上。

### 4.2 任课教师移动端

关键词：

```text
快速
单手操作
低层级
少输入
课堂中可用
```

原则：

- 首页即课堂操作页。
- 常用操作 1~2 次点击完成。
- 大按钮、大点击区域。
- 避免复杂表格和深层导航。
- 自定义积分才进入表单。
- 主要针对 360~430px 宽度优化。

### 4.3 班级大屏

关键词：

```text
远距离可读
低干扰
即时反馈
保护隐私
全屏稳定
```

原则：

- 大字号、高对比。
- 页面元素数量少。
- 座位姓名放大并居中，座位右上角胶囊显示当前积分周期总分。
- 不显示跨周期累计总分、负分次数。
- 不展示倒数排名。
- 动画短、明确。
- 支持 16:9，兼容 1920×1080 和 3840×2160。

## 5. 路由设计

```text
/login

/admin
/admin/students
/admin/students/committee
/admin/students/dormitories
/admin/seating
/admin/teachers
/admin/score-rules
/admin/score-records
/admin/display-devices

/invite/[token]

/teacher
/teacher/history

/display
/display/bind
```

权限：

```text
HEAD_TEACHER
→ /admin/*
→ /teacher/*

SUBJECT_TEACHER
→ /teacher/*

DISPLAY_DEVICE
→ /display/*
```

路由层只负责 UX 导航，最终权限由后端控制。

## 6. 班主任后台 App Shell

```text
┌──────────────────────────────────────────────────────┐
│ Logo / 系统名                  班级切换     用户菜单   │
├─────────────┬────────────────────────────────────────┤
│ 班级概览     │                                        │
│ 学生管理     │                                        │
│ 座位管理     │               页面内容                 │
│ 任课教师     │                                        │
│ 积分规则     │                                        │
│ 积分流水     │                                        │
│ 大屏设备     │                                        │
└─────────────┴────────────────────────────────────────┘
```

建议：

- 左侧导航：220~240px。
- 顶栏：56~64px。
- 主内容区 padding：24px。

## 7. 班级概览

路由：

```text
/admin
```

页面：

```text
高一（3）班

┌────────────┐ ┌────────────┐ ┌────────────┐
│ 学生       │ │ 任课教师   │ │ 大屏设备   │
│ 46         │ │ 7          │ │ 1 / 2      │
└────────────┘ └────────────┘ └────────────┘

快捷入口
[座位管理] [查看积分流水] [管理任课教师]

最近动态
今天 10:31   王老师   张三   回答问题
今天 10:26   李老师   李四   课堂纪律
```

MVP 不做复杂 Dashboard 和统计图表，仅保留统计入口。

## 8. 学生管理

路由：

```text
/admin/students
```

```text
学生管理

[搜索学生] [状态筛选]                  [新增学生]

姓名       学号       状态       身份             当前座位       操作
张三       1001       在班       班长 / 301       R2-C3          编辑
李四       1002       在班       普通学生         R2-C4          编辑
王五       1003       已离班     普通学生         -              查看
```

操作：

- 新增。
- 编辑。
- 停用。
- 查看历史信息。

新增 / 编辑使用 Drawer。

“身份”同时展示当前有效班委岗位和寝室；学生页提供班委设置、住宿生管理二级页面入口。

### 8.1 住宿生管理

路由：`/admin/students/dormitories`。

- 左侧选择、创建、重命名或删除本班寝室，右侧维护成员。
- 分配学生时允许从本班其他寝室直接转入。
- 先勾选当前寝室成员，再填写非零分值与原因提交寝室积分。
- 成员变化或寝室积分成功后刷新相关学生、寝室、流水和排行数据。

停用确认：

```text
停用学生？

停用后学生将从当前座位和排行榜中移除，
历史积分和座位记录继续保留。

[取消] [确认停用]
```

## 9. 任课教师管理

路由：

```text
/admin/teachers
```

```text
任课教师

姓名        科目       状态       最近访问       操作
王老师      数学       已激活     今天           管理
李老师      英语       待邀请     -              生成邀请
```

新增：

```text
姓名 *
科目 *

[取消] [创建]
```

创建后：

```text
王老师 · 数学

邀请链接已生成
https://example.com/invite/xxxxx

[复制链接] [显示二维码]
```

教师详情 Drawer：

```text
王老师
数学

状态：已激活
最近访问：今天 10:21

[重新生成邀请链接]
[撤销班级权限]
```

撤销权限必须二次确认。

## 10. 积分规则

路由：

```text
/admin/score-rules
```

```text
积分规则

规则名称        分值       状态       操作
回答问题        +2         启用       编辑
积极参与        +1         启用       编辑
课堂纪律        -2         启用       编辑

                                    [新增规则]
```

规则：

- 分值必须是整数。
- 不允许 0。
- 支持正负分。

## 11. 积分流水

路由：

```text
/admin/score-records
```

```text
积分流水

[本周] [学生筛选] [教师筛选] [科目筛选]

时间          学生       教师       科目       类型        变化
10:21         张三       王老师     数学       回答问题    +2
10:18         李四       陈老师     英语       自定义      +5
10:09         王五       王老师     数学       撤销        -2
```

详情 Drawer：

```text
积分记录

学生：张三
教师：王老师
科目：数学
时间：2026-08-25 10:21

类型：自定义积分
积分变化：+5

原因：
课堂完成高难度题目，并主动帮助同学理解解法。

[撤销此记录]
```

## 12. 大屏设备管理

路由：

```text
/admin/display-devices
```

```text
大屏设备                          1 / 2

┌────────────────────────────────────────────┐
│ 教室智慧黑板                              │
│ 在线                                       │
│ 最近在线：刚刚                            │
│                              [解除绑定]     │
└────────────────────────────────────────────┘

[绑定新设备]
```

绑定 Modal：

```text
绑定新大屏

请在智慧黑板打开：
example.com/display/bind

输入屏幕上的 6 位绑定码
[ _ _ _ _ _ _ ]

设备名称
[教室智慧黑板]

[取消] [确认绑定]
```

## 13. 座位管理

路由：

```text
/admin/seating
```

页面：

```text
座位管理

6 行 × 8 列                   [历史版本] [保存布局]

                    讲 台

┌────┬────┬────┬────┬────┬────┬────┬────┐
│张三│    │李四│    │王五│    │    │    │
├────┼────┼────┼────┼────┼────┼────┼────┤
│    │赵六│    │陈七│    │    │    │    │
├────┼────┼────┼────┼────┼────┼────┼────┤
│    │    │    │    │    │    │    │    │
└────┴────┴────┴────┴────┴────┴────┴────┘

未安排学生：
刘八  周九  吴十
```

网格规则：

- Classroom 定义固定 `rows × cols`。
- Cell 最多一个 Seat。
- Seat 最多一个 Student。
- Cell 没有 Seat 时为空。
- Seat 没有 Student 时显示“空座位”。

第一版不支持：

```text
自由像素移动
旋转
缩放
多格座位
自由绘制桌子
```

支持动作：

- 点击空 Cell 添加座位。
- 删除空座位。
- Seat 拖入其他空 Cell。
- Seat 拖到已有 Seat 时交换位置。
- 未安排学生拖入空 Seat。
- 学生拖到已有学生 Seat 时交换学生。

保存机制：

```text
拖拽过程中只修改前端本地状态
↓
显示“有未保存修改”
↓
点击保存布局
↓
提交完整 Seat Layout
↓
生成新版本
```

离开页面时若存在未保存修改：

```text
当前座位布局尚未保存

[继续编辑]
[放弃修改]
```

## 14. 座位历史版本

```text
座位布局历史

Version 19
2026-08-25 14:31
当前版本

Version 18
2026-08-20 10:20
[预览] [恢复]

Version 17
2026-08-12 09:11
[预览] [恢复]
```

恢复历史版本时创建新版本，不覆盖旧版本。

## 15. 任课教师邀请页

路由：

```text
/invite/:token
```

移动优先：

```text
加入班级

高一（3）班

任课教师
王老师 · 数学

班主任已邀请你使用课堂快捷操作。

[进入教师端]
```

邀请失效：

```text
邀请链接已失效

请联系班主任重新生成邀请链接。
```

## 16. 任课教师移动端

路由：

```text
/teacher
```

核心目标：

```text
打开网页
↓
找到学生
↓
加分 / 扣分
```

首页：

```text
高一（3）班
数学 · 王老师

┌──────────────────────────┐
│ 🎲 随机点名              │
└──────────────────────────┘

[搜索学生]

张三                 李四
王五                 赵六
陈明                 刘浩
周九                 吴十

────────────────────────────

最近操作

张三  回答问题  +2      [撤销]
李四  课堂纪律  -2      [撤销]
```

学生卡高度建议 56~72px，点击目标至少 44×44px。

## 17. 学生快捷积分 Sheet

```text
张三
────────────────

快捷积分

[回答问题 +2]
[积极参与 +1]
[帮助同学 +2]
[课堂纪律 -2]

[自定义积分]

────────────────

近期记录

今天 10:20  回答问题 +2
昨天 15:32  积极参与 +1
```

快捷规则一次点击直接提交，成功后显示轻量反馈：

```text
✓ 已记录
```

## 18. 自定义积分

```text
自定义积分

积分变化

[-]      +5      [+]

详细原因 *

[________________________________]
[________________________________]

至少填写 10 个字符

[确认记录]
```

提交中按钮禁止重复点击。

## 19. 任课教师撤销

```text
张三  回答问题 +2    [撤销]
```

点击后：

```text
撤销这次积分操作？

[取消] [撤销]
```

仅当前教师可撤销的记录显示按钮。

## 20. 随机点名

```text
随机点名

      张 三

[再次抽取]

本轮已点 5 人

李四、王五、赵六、陈明、刘浩
```

本轮名单存在前端本地状态，MVP 不持久化。

随机结果同步大屏。

## 21. 大屏绑定页

路由：

```text
/display/bind
```

```text
班级大屏绑定

请在班主任管理端输入以下绑定码

        583 921

有效期 04:32

等待绑定……
```

绑定成功后自动进入 `/display`。

## 22. 大屏主视图

```text
┌───────────────────────────────────┬──────────────────────┐
│                                   │ 本周 Top 3           │
│               讲台                │                      │
│                                   │ 🥇 张三              │
│   张三      李四      王五         │ 🥈 李四              │
│                                   │ 🥉 王五              │
│   赵六      陈明      刘浩         ├──────────────────────┤
│                                   │ 本周进步             │
│   周九      吴十                  │                      │
│                                   │ 陈明   ↑8            │
│                                   │ 刘浩   ↑5            │
│                                   │ 赵六   ↑3            │
└───────────────────────────────────┴──────────────────────┘
```

隐私要求：

- 显示当前积分周期总分（含周期初始分）。
- 不显示跨周期累计总分。
- 不显示负分次数。
- 不展示倒数排名。

## 23. 大屏座位卡状态

正常：

```text
┌──────────────┐
│    张 三     │
└──────────────┘
```

积分事件：

- 对对应座位做短暂轻量反馈。
- 展示具体增减数值，例如 `+2` 或 `-2`；座位角标同步更新当前积分周期总分。

随机点名：

```text
┌──────────────┐
│   🎯         │
│   张 三      │
│   被点名     │
└──────────────┘
```

持续约 8 秒后恢复。

无座位学生被点名时，使用屏幕中央 Overlay 展示姓名。

## 24. 大屏视图控制

轻量入口：

```text
⋯
```

设置：

```text
显示模式

● 座位 + 排行
○ 全屏座位
○ 全屏排行

[进入浏览器全屏]
```

设置保存在当前设备 LocalStorage，两块大屏可使用不同模式。

## 25. 大屏连接状态

WebSocket 断开：

```text
连接异常 · 正在重连
```

保留最后一次状态。

重连成功：

```text
GET /display/bootstrap
↓
覆盖本地状态
↓
恢复连接
```

## 26. 空状态

```text
没有学生：
还没有学生，请先添加学生。

没有座位：
座位布局尚未配置。

没有积分规则：
暂无快捷积分规则，仍可使用自定义积分。

没有排行榜：
本周暂无排名数据。

进步趋势数据不足：
暂无足够数据生成进步趋势。
```

## 27. Loading 与 Error

后台：

- Table Skeleton。
- Button Loading。
- Drawer Form Loading。

移动端：

- 学生列表 Skeleton。
- 局部提交 Loading。
- 提交失败保留输入内容。

座位保存失败：

```text
保存失败

当前编辑内容仍保留在页面中。

[重新保存]
```

## 28. 响应式策略

管理后台：

```text
>=1280px   完整 Sidebar
1024~1279  压缩 Sidebar
<1024px    可访问，但不是主要优化目标
```

教师移动端：

```text
主要 360~430px
Tablet 可扩展为 3~4 列学生网格
```

大屏：

```text
16:9
1920×1080
3840×2160
```

推荐使用：

```text
CSS Grid
clamp()
vw / vh
rem
```

## 29. 核心组件

共享：

```text
StudentName
ScoreDeltaBadge
ConnectionStatus
EmptyState
ConfirmAction
```

后台：

```text
AdminPageHeader
DataTable
EntityDrawer
TeacherInviteDialog
DeviceBindDialog
ScoreRecordDrawer
SeatHistoryDrawer
```

座位：

```text
ClassroomGrid
GridCell
SeatCard
UnassignedStudentList
SeatEditorToolbar
```

移动端：

```text
TeacherHeader
StudentQuickGrid
StudentQuickSheet
ScoreRuleButton
CustomScoreSheet
RecentActionList
RandomPickSheet
```

大屏：

```text
DisplayClassroomGrid
DisplaySeat
Top3Panel
ProgressPanel
RandomPickOverlay
DisplaySettings
RealtimeStatus
```

## 30. 状态管理

Server State 交给 TanStack Query：

```text
students
teachers
scoreRules
scoreRecords
seatLayout
ranking
displayDevices
```

Client State：

```text
座位编辑草稿
移动端本轮随机点名名单
大屏显示模式
大屏全屏状态
Sheet / Modal 状态
```

## 31. Realtime 前端结构

建立：

```text
RealtimeProvider
```

提供：

```text
useRealtimeStatus()
useRealtimeEvent()
```

典型处理：

```text
SCORE_CHANGED
→ 座位轻量反馈
→ invalidate ranking

RANKING_CHANGED
→ invalidate ranking/bootstrap

SEAT_LAYOUT_CHANGED
→ invalidate bootstrap

RANDOM_PICKED
→ 播放高亮动画
```

## 32. API 与页面映射

```text
/admin/students
→ Student API

/admin/teachers
→ Teacher API / Invitation API

/admin/seating
→ Seat Layout API

/admin/score-rules
→ Score Rule API

/admin/score-records
→ Score Record API

/admin/display-devices
→ Display Device API

/teacher
→ Students + Score Rules + Scores + Random Pick

/display
→ Display Bootstrap + Realtime
```

## 33. 设计 Token

```text
Radius:
8px / 12px / 16px

Spacing:
4 / 8 / 12 / 16 / 24 / 32

Motion:
150ms 普通交互
250ms Sheet / Dialog
300~500ms 大屏反馈
```

颜色由 Ant Design / Tailwind Theme 统一管理。

## 34. 可访问性

- 所有按钮有明确文本或 aria-label。
- Keyboard 可操作后台表单。
- Modal / Sheet 正确管理 Focus。
- 正负积分不只依赖颜色区分。
- 大屏文本对比度足够。
- 移动端点击目标至少 44×44px。

## 35. 前端开发优先级

### Phase 1：公共基础

- Vite SPA。
- Auth。
- API Client。
- TanStack Query。
- RealtimeProvider。
- App Shell。
- 权限路由。

### Phase 2：班主任 CRUD

- Students。
- Teachers。
- Score Rules。
- Score Records。
- Display Devices。

### Phase 3：座位编辑器

- ClassroomGrid。
- dnd-kit。
- Save Version。
- History / Restore。

### Phase 4：任课教师移动端

- Student Quick Grid。
- Quick Score。
- Custom Score。
- Recent Actions。
- Random Pick。

### Phase 5：大屏

- Bootstrap。
- Grid。
- Top3。
- Progress。
- Socket.IO。
- Random Pick Animation。
- Connection Recovery。

## 36. MVP UI 冻结范围

第一版重点：

```text
班主任：
管理学生
管理任课教师
管理积分规则
管理座位
查看积分流水
管理大屏

任课教师：
快速找到学生
一键规则积分
自定义积分
撤销自己的操作
随机点名

大屏：
清楚显示座位
显示 Top3
显示进步趋势
响应随机点名
实时同步
```

暂缓：

```text
复杂 Dashboard
统计图表
主题系统
多套大屏皮肤
座位模板库
复杂动画
课堂 Session
教师个人主页
学生个人端
```

UI 开发资源优先投入：

```text
SeatEditor
TeacherQuickActions
ClassroomDisplay
```

这三个页面决定产品的核心体验。
