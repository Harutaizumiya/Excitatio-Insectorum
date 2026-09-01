# 06 API Reference

本文档描述当前后端实现的对外接口，内容以 `src/**/*.controller.ts`、请求 DTO、
统一异常过滤器和实时 Gateway 为准。产品需求与设计背景仍以
`01-requirements.md` 至 `05-realtime-protocol.md` 为准。

## 1. 接入信息

| 项目           | 值                                              |
| -------------- | ----------------------------------------------- |
| REST 前缀      | `/api/v1`                                       |
| Swagger UI     | `/api/docs`，仅在 `SWAGGER_ENABLED=true` 时启用 |
| 请求格式       | `application/json`                              |
| 用户认证       | `Authorization: Bearer <accessToken>`           |
| 大屏认证       | `Authorization: Bearer <displayAccessToken>`    |
| 实时 Namespace | `/realtime`                                     |
| 时间格式       | ISO 8601 UTC，例如 `2026-08-25T10:20:00.000Z`   |

以下路径均省略 `/api/v1` 前缀。

全局请求校验规则：

- 未在 DTO 中声明的字段会被拒绝。
- Query 参数会按 DTO 转换为目标类型。
- UUID/ID 在 HTTP 层统一表现为字符串。
- `POST` 默认成功状态为 `201`，`GET/PATCH/PUT` 默认成功状态为 `200`；
  `POST /display/auth/token` 显式返回 `200`。

## 2. 身份与权限

| 标记    | 含义                        |
| ------- | --------------------------- |
| Public  | 无需 Access Token           |
| USER    | 教师用户 Access Token       |
| DISPLAY | 大屏设备 Access Token       |
| HEAD    | 班主任，`HEAD_TEACHER`      |
| SUBJECT | 任课教师，`SUBJECT_TEACHER` |

包含 `:classId` 的受保护接口会验证当前用户与班级之间存在 ACTIVE
`ClassTeacher` 关系。仅持有其他班级权限不能访问目标班级。

## 3. 通用响应

普通成功响应：

```json
{
  "data": {}
}
```

分页响应：

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 0
  }
}
```

失败响应：

```json
{
  "code": "VALIDATION_FAILED",
  "message": "请求字段不合法",
  "requestId": "request-id"
}
```

通用 HTTP 状态：

| 状态  | 含义                           |
| ----- | ------------------------------ |
| `400` | 参数验证或业务输入错误         |
| `401` | Token、账号密码或设备凭证无效  |
| `403` | 身份、班级或角色无权访问       |
| `404` | 资源不存在                     |
| `409` | 并发版本、重复撤销或状态冲突   |
| `410` | 邀请、绑定码或绑定凭证已经失效 |
| `429` | 触发限流                       |
| `500` | 未处理的服务器错误             |

## 4. API 总览

### 4.1 Auth

| 方法 | 路径                               | 权限   | 请求                       | 用途                           |
| ---- | ---------------------------------- | ------ | -------------------------- | ------------------------------ |
| POST | `/auth/login`                      | Public | `LoginRequest`             | 账号密码登录                   |
| POST | `/auth/refresh`                    | Public | `RefreshRequest`           | 轮换 Refresh Token             |
| POST | `/auth/logout`                     | USER   | 无                         | 吊销当前会话并断开对应实时连接 |
| POST | `/auth/invitations/:token/consume` | Public | `ConsumeInvitationRequest` | 一次性消费任课教师邀请         |

### 4.2 Classrooms

| 方法  | 路径                | 权限           | 请求                     | 用途                       |
| ----- | ------------------- | -------------- | ------------------------ | -------------------------- |
| GET   | `/classes`          | USER           | 无                       | 列出当前用户可访问班级     |
| GET   | `/classes/:classId` | HEAD / SUBJECT | 无                       | 获取班级详情和当前用户关系 |
| PATCH | `/classes/:classId` | HEAD           | `UpdateClassroomRequest` | 更新班级信息或座位网格     |

### 4.3 Teachers

| 方法  | 路径                                                     | 权限 | 请求                   | 用途                     |
| ----- | -------------------------------------------------------- | ---- | ---------------------- | ------------------------ |
| GET   | `/classes/:classId/teachers`                             | HEAD | 无                     | 查询班级教师关系         |
| POST  | `/classes/:classId/teachers`                             | HEAD | `CreateTeacherRequest` | 创建任课教师             |
| PATCH | `/classes/:classId/teachers/:classTeacherId`             | HEAD | `UpdateTeacherRequest` | 更新教师姓名或科目       |
| POST  | `/classes/:classId/teachers/:classTeacherId/revoke`      | HEAD | 无                     | 撤销教师关系、邀请和会话 |
| POST  | `/classes/:classId/teachers/:classTeacherId/invitations` | HEAD | 无                     | 创建一次性邀请           |

### 4.4 Students

| 方法  | 路径                                               | 权限           | 请求                    | 用途                      |
| ----- | -------------------------------------------------- | -------------- | ----------------------- | ------------------------- |
| GET   | `/classes/:classId/students`                       | HEAD / SUBJECT | Query                   | 分页查询学生              |
| POST  | `/classes/:classId/students`                       | HEAD           | `CreateStudentRequest`  | 新增学生                  |
| PATCH | `/classes/:classId/students/:studentId`            | HEAD           | `UpdateStudentRequest`  | 更新学生                  |
| POST  | `/classes/:classId/students/:studentId/deactivate` | HEAD           | 无                      | 停用学生并从当前布局解除  |
| POST  | `/classes/:classId/students/import/parse`          | HEAD           | multipart `file`        | 解析 Excel/CSV 并返回预览 |
| POST  | `/classes/:classId/students/import`                | HEAD           | `ImportStudentsRequest` | 批量创建学生              |

批量解析仅支持 `.xlsx` 和 `.csv`，文件最大 5MB，最多识别 500 条数据记录。解析接口只读文件，不写数据库；可在 multipart 字段 `mapping` 中传入 JSON 以覆盖自动映射，例如：

```json
{ "name": "学生姓名", "studentNo": "学籍号", "gender": "男女" }
```

导入请求的每条学生包含 `name`、可空 `studentNo` 和 `gender`（`MALE|FEMALE|UNKNOWN`）。有学号时按 `classId + studentNo` 去重，无学号时按 `classId + name` 去重；重复记录会跳过并在响应的 `duplicates` 中返回。

学生查询参数：

| 参数       | 类型               | 默认值 | 说明           |
| ---------- | ------------------ | ------ | -------------- |
| `status`   | `ACTIVE\|INACTIVE` | 无     | 状态过滤       |
| `keyword`  | string，最长 100   | 无     | 姓名或学号搜索 |
| `page`     | integer >= 1       | 1      | 页码           |
| `pageSize` | integer 1..100     | 20     | 每页数量       |

### 4.5 Seat Layout

| 方法 | 路径                                                        | 权限           | 请求                    | 用途                   |
| ---- | ----------------------------------------------------------- | -------------- | ----------------------- | ---------------------- |
| GET  | `/classes/:classId/seat-layout`                             | HEAD / SUBJECT | 无                      | 获取当前完整座位快照   |
| PUT  | `/classes/:classId/seat-layout`                             | HEAD           | `SaveSeatLayoutRequest` | 保存新的完整布局版本   |
| GET  | `/classes/:classId/seat-layout/versions`                    | HEAD           | Query                   | 分页查询历史版本       |
| GET  | `/classes/:classId/seat-layout/versions/:versionId`         | HEAD           | 无                      | 预览历史版本           |
| POST | `/classes/:classId/seat-layout/versions/:versionId/restore` | HEAD           | 无                      | 将历史版本恢复为新版本 |

历史版本 Query 支持 `page`（默认 1）和 `pageSize`（默认 20）。

### 4.6 Schedule

| 方法 | 路径 | 权限 | 请求 | 用途 |
| ---- | ---- | ---- | ---- | ---- |
| GET | `/classes/:classId/schedule` | HEAD / SUBJECT | 无 | 获取周课表与作息模板 |
| PUT | `/classes/:classId/schedule` | HEAD | `SaveScheduleRequest` | 事务保存模板、当前模板和课程 |

`SaveScheduleRequest` 的模板节次使用 `periodNo`、`startTime`、`endTime`；时间格式为 `HH:mm`，模板最多 12 节且节次集合一致。课程名称必填，`classTeacherId` 只能引用本班 ACTIVE 任课教师。

### 4.7 Score Rules

| 方法  | 路径                                            | 权限           | 请求                     | 用途         |
| ----- | ----------------------------------------------- | -------------- | ------------------------ | ------------ |
| GET   | `/classes/:classId/score-rules`                 | HEAD / SUBJECT | `enabled?: boolean`      | 查询积分规则 |
| POST  | `/classes/:classId/score-rules`                 | HEAD           | `CreateScoreRuleRequest` | 创建积分规则 |
| PATCH | `/classes/:classId/score-rules/:ruleId`         | HEAD           | `UpdateScoreRuleRequest` | 更新积分规则 |
| POST  | `/classes/:classId/score-rules/:ruleId/disable` | HEAD           | 无                       | 停用积分规则 |

### 4.8 Score Records

| 方法 | 路径                                        | 权限           | 请求                 | 用途             |
| ---- | ------------------------------------------- | -------------- | -------------------- | ---------------- |
| POST | `/classes/:classId/scores/rule`             | HEAD / SUBJECT | `RuleScoreRequest`   | 按规则记分       |
| POST | `/classes/:classId/scores/custom`           | HEAD / SUBJECT | `CustomScoreRequest` | 自定义记分       |
| GET  | `/classes/:classId/scores`                  | HEAD / SUBJECT | Query                | 分页查询积分流水 |
| POST | `/classes/:classId/scores/:recordId/revert` | HEAD / SUBJECT | 无                   | 事务性撤销积分   |

积分流水 Query：

| 参数         | 类型           | 默认值 | 说明           |
| ------------ | -------------- | ------ | -------------- |
| `studentId`  | string         | 无     | 学生过滤       |
| `operatorId` | string         | 无     | 操作教师过滤   |
| `from`       | ISO 8601       | 无     | 起始时间，包含 |
| `to`         | ISO 8601       | 无     | 结束时间，包含 |
| `page`       | integer >= 1   | 1      | 页码           |
| `pageSize`   | integer 1..100 | 20     | 每页数量       |

任课教师只能撤销本人创建的积分记录；班主任可以撤销本班任意可撤销记录。

### 4.9 Ranking and Random Pick

| 方法 | 路径                            | 权限           | 请求                | 用途                       |
| ---- | ------------------------------- | -------------- | ------------------- | -------------------------- |
| GET  | `/classes/:classId/ranking`     | HEAD / SUBJECT | 无                  | 获取本周 Top3 和周环比进步 |
| POST | `/classes/:classId/random-pick` | HEAD / SUBJECT | `RandomPickRequest` | 随机选择 ACTIVE 学生       |

排行榜使用 UTC 周一 00:00 为周边界，响应不返回学生积分。

### 4.10 Display

| 方法 | 路径                                                 | 权限           | 请求                        | 用途                           |
| ---- | ---------------------------------------------------- | -------------- | --------------------------- | ------------------------------ |
| POST | `/display/binding-codes`                             | Public         | 无                          | 大屏创建六位绑定码和 nonce     |
| POST | `/display/binding-sessions/:bindingSessionId/poll`   | Public + nonce | `PollBindingSessionRequest` | 一次性领取长期设备凭证         |
| POST | `/classes/:classId/display-devices/bind`             | HEAD           | `BindDisplayRequest`        | 班主任绑定设备                 |
| GET  | `/classes/:classId/display-devices`                  | HEAD           | 无                          | 查询设备与在线状态             |
| POST | `/classes/:classId/display-devices/:deviceId/revoke` | HEAD           | 无                          | 吊销设备和全部凭证             |
| POST | `/display/auth/token`                                | Public         | `DeviceTokenRequest`        | 长期凭证换取短期 Access Token  |
| GET  | `/display/bootstrap`                                 | DISPLAY        | 无                          | 获取班级、座位和隐私化排行状态 |

每班最多两个 ACTIVE 大屏设备。在线判断窗口为最近 90 秒。

## 5. 请求模型

### 5.1 Auth

```ts
interface LoginRequest {
  account: string; // 1..100
  password: string; // 1..200
}

interface RefreshRequest {
  refreshToken: string;
}

interface ConsumeInvitationRequest {
  deviceName: string; // 1..120
}
```

### 5.2 Classroom, Teacher and Student

```ts
interface UpdateClassroomRequest {
  name?: string; // <= 120
  grade?: string; // <= 50
  schoolYear?: string; // <= 20
  gridRows?: number; // integer 1..20
  gridCols?: number; // integer 1..20
}

interface CreateTeacherRequest {
  name: string; // 1..100
  subject: string; // 1..100
}

interface UpdateTeacherRequest {
  name?: string; // 1..100
  subject?: string; // 1..100
}

interface CreateStudentRequest {
  name: string; // 1..100
  studentNo?: string; // 1..50
}

interface UpdateStudentRequest {
  name?: string; // 1..100
  studentNo?: string; // 1..50
}
```

### 5.3 Seat Layout

```ts
interface SaveSeatLayoutRequest {
  // 完整快照；同一坐标和同一学生均不可重复
  seats: Array<{
    row: number; // zero-based integer
    col: number; // zero-based integer
    studentId: string | null;
  }>;

  // 乐观并发基线；无现有布局时为 0
  baseVersion?: number;
}
```

坐标必须位于班级当前网格范围内，关联学生必须属于当前班级且状态为 ACTIVE。

### 5.4 Scores

```ts
interface CreateScoreRuleRequest {
  name: string; // 非空，<= 100
  delta: number; // 非 0 整数
  description?: string | null;
}

interface UpdateScoreRuleRequest {
  name?: string;
  delta?: number; // 非 0 整数
  description?: string | null;
  enabled?: boolean;
}

interface RuleScoreRequest {
  studentId: string;
  ruleId: string;
}

interface CustomScoreRequest {
  studentId: string;
  delta: number; // 非 0 整数
  reason: string; // trim 后至少 10 字符
}
```

### 5.5 Random Pick and Display

```ts
interface RandomPickRequest {
  excludeStudentIds?: string[]; // 最多 200 个
}

interface BindDisplayRequest {
  code: string; // 六位数字
  name: string; // 1..120，必须包含非空白字符
}

interface PollBindingSessionRequest {
  nonce: string; // 创建绑定码时仅返回给大屏，至少 32 字符
}

interface DeviceTokenRequest {
  deviceId: string; // 1..100
  credential: string; // 32..512
}
```

## 6. 关键响应模型

### 6.1 登录和邀请

```ts
interface LoginData {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string };
}

interface RefreshData {
  accessToken: string;
  refreshToken: string;
}

interface InvitationConsumeData extends RefreshData {
  classroom: { id: string; name: string };
  teacher: { id: string; name: string; subject: string | null };
}
```

Refresh Token 每次成功使用后都会轮换，旧 Token 立即失效。

### 6.2 Classroom, Teacher and Student

```ts
interface ClassroomSummary {
  id: string;
  name: string;
  grade: string;
  schoolYear: string;
  gridRows: number;
  gridCols: number;
  role: 'HEAD_TEACHER' | 'SUBJECT_TEACHER';
  subject: string | null;
}

interface ClassSchedule {
  activeTemplateId: string | null;
  templates: Array<{ id: string; name: string; periods: Array<{ periodNo: number; startTime: string; endTime: string }> }>;
  entries: Array<{ weekday: number; periodNo: number; courseName: string; classTeacherId: string | null; teacher: { id: string; name: string } | null }>;
}

interface Student {
  id: string;
  classId: string;
  name: string;
  studentNo: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}
```

创建任课教师返回：

```json
{
  "data": {
    "classTeacherId": "relation-id",
    "teacherId": "teacher-id"
  }
}
```

创建邀请返回 `inviteUrl` 和 `expiresAt`。服务端只持久化邀请 Token 的 hash。

### 6.3 Seat Layout

```ts
interface SeatLayout {
  versionId: string | null;
  version: number | null;
  rows: number;
  cols: number;
  seats: Array<{
    id: string;
    row: number;
    col: number;
    student: { id: string; name: string } | null;
  }>;
}

interface SeatLayoutMutation {
  versionId: string;
  version: number;
  sourceVersionId?: string;
}
```

恢复历史布局不会覆盖旧版本，而是创建新版本。已离班学生在新恢复版本中会被置空。

### 6.4 Score and Ranking

```ts
interface ScoreRule {
  id: string;
  classId: string;
  name: string;
  delta: number;
  description: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface ScoreRecord {
  id: string;
  student: { id: string; name: string };
  operator: { id: string; name: string };
  subject: string | null;
  rule: { id: string; name: string } | null;
  delta: number;
  reason: string | null;
  recordType: 'NORMAL' | 'REVERT';
  reverted: boolean;
  createdAt: string;
}

interface WeeklyRanking {
  period: {
    type: 'WEEK';
    startAt: string;
    endAt: string;
  };
  top3: Array<{ studentId: string; name: string; rank: number }>;
  progress: Array<{
    studentId: string;
    name: string;
    previousRank: number;
    currentRank: number;
    change: number;
  }>;
  strategy: string;
}
```

`change = previousRank - currentRank`。排行榜和大屏响应不会返回 score。

### 6.5 Display Binding

创建绑定码：

```json
{
  "data": {
    "code": "583921",
    "expiresAt": "2026-08-25T10:25:00.000Z",
    "bindingSessionId": "session-id",
    "nonce": "only-known-by-display"
  }
}
```

轮询未绑定：

```json
{
  "data": {
    "status": "PENDING"
  }
}
```

轮询绑定完成；credential 只能成功领取一次：

```json
{
  "data": {
    "status": "READY",
    "deviceId": "device-id",
    "credential": "long-lived-device-credential"
  }
}
```

设备换取短期 Token：

```json
{
  "data": {
    "accessToken": "display-jwt",
    "expiresIn": 1800
  }
}
```

大屏 Bootstrap：

```ts
interface DisplayBootstrap {
  classroom: {
    id: string;
    name: string;
    gridRows: number;
    gridCols: number;
  };
  layout: {
    version: number | null;
    seats: Array<{
      row: number;
      col: number;
      student: { id: string; name: string } | null;
    }>;
  };
  ranking: {
    top3: Array<{ studentId: string; name: string; rank: number }>;
    progress: Array<{ studentId: string; name: string; change: number }>;
  };
}
```

## 7. 大屏绑定流程

```text
大屏 POST /display/binding-codes
  -> 保存 bindingSessionId + nonce，向班主任展示 code

班主任 POST /classes/:classId/display-devices/bind
  -> body: code + name
  -> 返回 deviceId，不返回 credential

大屏 POST /display/binding-sessions/:bindingSessionId/poll
  -> body: nonce
  -> PENDING 时继续轮询
  -> READY 时一次性领取 deviceId + credential

大屏 POST /display/auth/token
  -> deviceId + credential 换取短期 DISPLAY Access Token

大屏 GET /display/bootstrap
  -> 使用 DISPLAY Access Token 获取完整状态
```

绑定码与绑定会话有效期为 5 分钟。credential 在数据库中只保存 hash，在临时
Redis 会话中使用服务端密钥加密，并在领取时通过 `GETDEL` 一次性消费。

## 8. 实时通信

连接地址：

```ts
io(API_ORIGIN + '/realtime', {
  auth: {
    token: accessToken,
    // USER 必填；DISPLAY 可省略，若提供则必须与 Token classId 一致
    classId,
  },
});
```

服务端会把连接加入 `class:{classId}` Room。Access Token 到期、用户登出、
教师关系撤销或设备吊销后，连接会被主动断开或在周期复查时断开。

统一事件：

```ts
interface ClassRealtimeEvent<T> {
  id: string;
  type:
    | 'SCORE_CHANGED'
    | 'SCORE_REVERTED'
    | 'RANKING_CHANGED'
    | 'SEAT_LAYOUT_CHANGED'
    | 'STUDENT_CHANGED'
    | 'SCHEDULE_CHANGED'
    | 'RANDOM_PICKED';
  classId: string;
  occurredAt: string;
  payload: T;
}
```

| 事件                  | Payload                                                      |
| --------------------- | ------------------------------------------------------------ |
| `SCORE_CHANGED`       | `{ studentId, direction: "INCREASE"\|"DECREASE" }`           |
| `SCORE_REVERTED`      | `{ studentId, recordId }`                                    |
| `RANKING_CHANGED`     | `{ period: "WEEK" }`                                         |
| `SEAT_LAYOUT_CHANGED` | `{ version }`                                                |
| `STUDENT_CHANGED`     | `{ studentId, action: "CREATED"\|"UPDATED"\|"DEACTIVATED" }` |
| `SCHEDULE_CHANGED`    | `{ activeTemplateId }`                                      |
| `RANDOM_PICKED`       | `{ studentId, name, displayDurationMs: 8000 }`               |

客户端首次连接和每次重连后都应调用 `GET /display/bootstrap`，以 REST/数据库
状态覆盖本地状态；实时事件只用于通知和临时动画。

## 9. 限流与安全注意事项

| 操作       | 当前限制                                 |
| ---------- | ---------------------------------------- |
| 登录       | 同来源地址与账号每分钟 10 次             |
| Refresh    | 同来源地址与 Token hash 每分钟 30 次     |
| 邀请消费   | 同来源地址与邀请 Token hash 每分钟 10 次 |
| 创建绑定码 | 同来源地址每分钟 10 次                   |
| 消费绑定码 | 按操作者、班级和来源地址每分钟 20 次     |

- 邀请 Token、Refresh Token 和设备长期凭证的数据库持久化值均为 hash。
- 邀请消费 URL 会在应用请求日志中脱敏。
- 积分和座位事务提交后才发布实时事件；事件失败不会回滚已提交业务状态。
- `requestId` 可用于关联客户端错误与服务端日志。

## 10. 实现对应位置

- 应用前缀和 Swagger：`src/main.ts`
- HTTP 路由：`src/**/*.controller.ts`
- 请求约束：`src/**/dto/*.ts`
- 统一异常格式：`src/common/filters/http-exception.filter.ts`
- 实时协议实现：`src/realtime/realtime.gateway.ts`
- Swagger UI：启动服务后访问 `/api/docs`
