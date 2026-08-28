# 03 后端架构设计

## 1. 技术栈

```text
Node.js
TypeScript
NestJS
Prisma
PostgreSQL
Passport / JWT
Socket.IO
Redis
Swagger / OpenAPI
Pino
Docker
```

MVP 采用模块化单体。

---

## 2. 架构原则

### 模块化单体

所有后端功能部署为一个 NestJS Application。

优势：

- 事务简单。
- 模块间调用直接。
- 本地开发方便。
- 部署成本低。
- 后续仍可以按 Module 拆服务。

### HTTP 是状态接口，WebSocket 是事件接口

原则：

```text
REST API / PostgreSQL = 最终状态
Socket.IO = 状态变化通知
```

大屏重连后始终重新拉取 bootstrap 状态。

### 权限在后端强制执行

前端隐藏按钮只属于 UI 体验。

实际权限必须通过：

- Authentication Guard
- Role / Class Scope Guard
- Service 层业务校验

共同保证。

---

## 3. NestJS Module

推荐：

```text
src/
├── app.module.ts
├── auth/
├── users/
├── classrooms/
├── teachers/
├── students/
├── seating/
├── scores/
├── ranking/
├── displays/
├── realtime/
├── random-pick/
├── prisma/
├── redis/
├── common/
└── config/
```

---

## 4. Module 职责

### AuthModule

负责：

- 班主任登录。
- Access Token。
- Refresh Token。
- Refresh Token 轮换。
- 任课教师邀请码消费。
- 任课教师长期 Session。
- 大屏设备凭证换取 Access Token。
- 登出和吊销。

不负责：

- 班级业务权限。

### UsersModule

负责：

- 用户基础信息。
- 用户状态。
- 用户查询。

### ClassroomsModule

负责：

- 班级基础信息。
- gridRows / gridCols。
- 当前布局版本。
- 班主任作用域。

### TeachersModule

负责：

- ClassTeacher。
- 任课教师创建。
- 教师关系撤销。
- TeacherInvitation。
- 邀请链接生成。
- 科目信息。

### StudentsModule

负责：

- 学生新增、修改、停用。
- ACTIVE 学生列表。
- 学生基础查询。

### SeatingModule

负责：

- 当前座位布局。
- 座位布局保存。
- 版本列表。
- 历史预览。
- 历史恢复。
- 网格边界校验。
- 学生重复座位校验。

### ScoresModule

负责：

- ScoreRule CRUD。
- 规则加减分。
- 自定义加减分。
- 积分流水。
- 撤销。
- 权限判断。
- 积分事件发送。

可以拆：

```text
ScoresModule
├── ScoreRulesService
└── ScoreRecordsService
```

### RankingModule

负责：

- 本周 Top3。
- 上周/本周排名。
- 进步趋势。
- 排名策略抽象。

接口：

```ts
interface RankingStrategy {
  getProgressRanking(classId: string, period: RankingPeriod): Promise<ProgressItem[]>;
}
```

默认：

```text
WeekOverWeekRankChangeStrategy
```

### DisplaysModule

负责：

- 设备绑定码。
- DisplayDevice。
- 设备凭证。
- 最多 2 个 ACTIVE 设备约束。
- 设备吊销。
- lastSeen。
- Display Bootstrap。

### RandomPickModule

负责：

- ACTIVE 学生过滤。
- 随机选择。
- 返回结果。
- 向 RealtimeModule 发布 RANDOM_PICKED。

MVP 不存储点名历史。

### RealtimeModule

负责：

- Socket.IO Gateway。
- WebSocket 认证。
- Room 管理。
- Class Event 广播。
- 未来 Redis Adapter。

业务 Module 不直接操作 Socket.IO Server。

统一调用：

```ts
realtimeService.publishClassEvent(classId, event);
```

### PrismaModule

全局数据库访问。

### RedisModule

MVP 用于：

- Display Binding Code。
- 短期状态。
- Rate Limit。
- 后续多实例 Socket.IO Adapter。

核心数据不依赖 Redis。

---

## 5. 模块依赖

推荐依赖方向：

```text
Auth
 ├── Users
 └── Teachers

Classrooms

Teachers
 ├── Users
 └── Classrooms

Students
 └── Classrooms

Seating
 ├── Classrooms
 ├── Students
 └── Realtime

Scores
 ├── Classrooms
 ├── Students
 ├── Teachers
 ├── Ranking
 └── Realtime

Ranking
 ├── Students
 └── Prisma

Displays
 ├── Classrooms
 ├── Redis
 └── Realtime

RandomPick
 ├── Students
 └── Realtime
```

避免循环依赖。

Ranking 可以通过 Prisma 直接执行只读聚合查询，减少 Scores ↔ Ranking 双向依赖。

---

## 6. 鉴权模型

### Access Token

建议 15～30 分钟。

用户 Token：

```json
{
  "sub": "user-id",
  "type": "USER",
  "sessionId": "session-id"
}
```

设备 Token：

```json
{
  "sub": "device-id",
  "type": "DISPLAY_DEVICE",
  "classId": "class-id"
}
```

### Refresh Token

教师 Web 和移动端：

- 长期有效，建议 90～180 天。
- 服务端保存 hash。
- 支持主动吊销。
- Refresh 时轮换。

### Teacher Invitation Token

- 一次性。
- 默认 24h。
- 数据库只保存 hash。
- 使用后失效。

### Device Credential

- 长期设备凭证。
- 不直接作为业务 Access Token 使用。
- 设备凭证换取短期 Access Token。
- 班主任吊销设备后禁止换取新 Access Token。

---

## 7. 授权模型

权限由：

```text
身份类型
+
ClassTeacher.role
+
classId scope
```

共同决定。

### 班主任

`HEAD_TEACHER`

允许：

- 管理本班所有业务。

### 任课教师

`SUBJECT_TEACHER`

允许：

- 查看本班学生、座位和积分流水。
- 创建本班积分。
- 撤销自己创建的积分。
- 随机点名。

### 大屏

`DISPLAY_DEVICE`

允许：

- 访问 Display 专用只读接口。
- 连接本班 WebSocket Room。

禁止访问教师业务 API。

---

## 8. Guard 设计

建议：

```text
JwtAuthGuard
UserTypeGuard
ClassAccessGuard
RoleGuard
```

Decorator：

```ts
@RequireRoles(TeacherRole.HEAD_TEACHER)
@ClassScope('classId')
```

任课教师撤销积分需要 Service 层进一步判断：

```text
record.operatorId === currentUser.id
```

---

## 9. DTO 和校验

使用：

```text
class-validator
class-transformer
```

全局：

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

示例：

```ts
export class CustomScoreDto {
  @IsUUID()
  studentId: string;

  @IsInt()
  @NotEquals(0)
  delta: number;

  @IsString()
  @MinLength(10)
  reason: string;
}
```

---

## 10. 异常设计

统一业务异常：

```text
BusinessException
```

推荐错误结构：

```json
{
  "code": "SCORE_RECORD_ALREADY_REVERTED",
  "message": "该积分记录已经撤销",
  "requestId": "..."
}
```

HTTP 状态：

```text
400 参数或业务状态错误
401 未登录
403 无权限
404 资源不存在
409 状态冲突 / 唯一性冲突
429 请求过多
500 服务端异常
```

业务 Code 稳定，前端根据 Code 做精确提示。

---

## 11. 日志

推荐 Pino。

每次请求至少记录：

```text
requestId
method
path
statusCode
duration
userId
deviceId
classId
```

关键审计事件：

```text
TEACHER_INVITED
TEACHER_REVOKED
SCORE_CREATED
SCORE_REVERTED
SEAT_LAYOUT_SAVED
SEAT_LAYOUT_RESTORED
DISPLAY_BOUND
DISPLAY_REVOKED
```

积分流水本身已经具备主要审计信息，不需要重复存储完整业务 payload 到日志。

---

## 12. 事务策略

Prisma `$transaction`。

重点：

- Seat Layout 保存。
- Seat Layout 恢复。
- Score 撤销。
- 设备绑定。
- 邀请消费。

WebSocket 事件在事务成功后发布。

推荐：

```text
数据库事务成功
↓
publish event
```

避免广播已经回滚的数据。

---

## 13. Realtime 架构

Socket.IO Room：

```text
class:{classId}
```

设备连接：

1. 使用 Device Access Token。
2. Gateway 校验。
3. 从 Token 获取 classId。
4. 加入 `class:{classId}`。
5. 更新 lastSeen。

未来如果教师端需要实时反馈，也可加入相同 Room。

业务代码：

```ts
await this.realtime.publishClassEvent(classId, {
  type: 'RANDOM_PICKED',
  payload: {...},
})
```

---

## 14. Redis

MVP 使用：

### Display Binding Code

```text
display:binding:{code}
TTL = 5min
```

value：

```json
{
  "temporaryDeviceId": "...",
  "nonce": "..."
}
```

### Rate Limit

推荐对：

- 登录。
- 邀请消费。
- 设备绑定。
- Refresh Token。

做限速。

### Socket.IO Adapter

单实例 MVP 暂不需要。

多实例时启用 Redis Adapter。

---

## 15. 配置管理

使用：

```text
@nestjs/config
```

环境变量：

```text
NODE_ENV
PORT
DATABASE_URL
REDIS_URL

JWT_ACCESS_SECRET
JWT_ACCESS_EXPIRES_IN
JWT_REFRESH_SECRET

INVITATION_EXPIRES_IN
DEVICE_ACCESS_EXPIRES_IN

CORS_ORIGIN
LOG_LEVEL
```

生产环境 Secret 不进入 Git。

---

## 16. Swagger / OpenAPI

NestJS 使用 `@nestjs/swagger`。

要求：

- 所有 Controller 有 Tag。
- 所有 DTO 有 Schema。
- 统一声明 Bearer Auth。
- 所有主要 Error Code 写进接口描述。
- `/api/docs` 在生产环境可通过权限或环境变量控制。

OpenAPI 是接口结构的唯一事实来源。

---

## 17. 推荐开发顺序

### Phase 1：基础工程

- NestJS 初始化。
- Prisma。
- PostgreSQL。
- Redis。
- Config。
- Logging。
- Swagger。
- Exception Filter。

### Phase 2：认证与班级

- User。
- Auth。
- Classroom。
- ClassTeacher。
- HEAD_TEACHER 权限。

### Phase 3：核心 CRUD

- Student。
- Teacher。
- ScoreRule。

### Phase 4：积分核心

- ScoreRecord。
- 自定义积分。
- 撤销。
- Ranking。

### Phase 5：座位

- Grid 配置。
- SeatLayoutVersion。
- 保存。
- 恢复。

### Phase 6：设备和实时

- Display Binding。
- Device Credential。
- Socket.IO。
- Bootstrap。
- Realtime Events。

### Phase 7：随机点名

- Random Pick。
- RANDOM_PICKED 广播。

完成以上阶段后，后端 MVP 可以视为可供前端开发。
