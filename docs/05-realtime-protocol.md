# 05 实时通信协议

## 1. 技术

```text
NestJS WebSocketGateway
Socket.IO
Redis Adapter（多实例时启用）
```

MVP 单实例可以不启用 Redis Adapter。

---

## 2. 设计原则

WebSocket 只负责实时通知。

```text
数据库 / REST = 最终状态
Socket.IO = 发生了什么
```

大屏：

- 首次进入调用 `/display/bootstrap`。
- Socket 重连成功后再次调用 `/display/bootstrap`。
- 收到状态型事件后按需重新请求最新数据。
- 临时动画型事件直接消费 payload。

---

## 3. Namespace

建议：

```text
/realtime
```

连接：

```text
wss://example.com/realtime
```

---

## 4. 认证

Socket.IO handshake：

```ts
io(API_URL + '/realtime', {
  auth: {
    token: accessToken,
  },
});
```

Gateway：

1. 校验 Access Token。
2. 判断 type。
3. DISPLAY_DEVICE 从 Token 获取 classId。
4. USER 根据 ClassTeacher 权限决定可加入的班级。
5. 拒绝越权订阅。

---

## 5. Room

统一：

```text
class:{classId}
```

例如：

```text
class:01HXYZ...
```

一个班级最多：

- 2 个大屏。
- 若干教师客户端。

---

## 6. Event Envelope

统一格式：

```json
{
  "id": "event-id",
  "type": "SCORE_CHANGED",
  "classId": "...",
  "occurredAt": "2026-08-25T10:20:00Z",
  "payload": {}
}
```

字段：

- `id`：事件唯一 ID。
- `type`：事件类型。
- `classId`：班级。
- `occurredAt`：服务器事件时间。
- `payload`：事件数据。

---

## 7. 事件分类

### 状态变化事件

收到后客户端应重新拉取对应状态。

```text
SCORE_CHANGED
SCORE_REVERTED
SEAT_LAYOUT_CHANGED
RANKING_CHANGED
STUDENT_CHANGED
DISPLAY_CONFIG_CHANGED
SCHEDULE_CHANGED
```

### 临时交互事件

直接用于 UI 动画，不要求持久状态。

```text
RANDOM_PICKED
```

---

## 8. SCORE_CHANGED

积分记录创建成功。

```json
{
  "id": "...",
  "type": "SCORE_CHANGED",
  "classId": "...",
  "occurredAt": "...",
  "payload": {
    "studentId": "...",
    "direction": "INCREASE"
  }
}
```

隐私考虑：

- 大屏无需收到具体 delta。
- 大屏无需收到总积分。
- `direction` 可用于播放正向或负向轻量反馈。
- 如果希望负向行为不公开，可进一步只发送 `SCORE_ACTIVITY`，由产品层决定动画。

推荐大屏行为：

- 对对应学生 Seat 产生轻量反馈。
- 拉取最新 ranking。

---

## 9. SCORE_REVERTED

```json
{
  "id": "...",
  "type": "SCORE_REVERTED",
  "classId": "...",
  "occurredAt": "...",
  "payload": {
    "studentId": "...",
    "recordId": "..."
  }
}
```

大屏：

- 不需要展示“撤销”文字。
- 重新请求 ranking。

---

## 10. RANKING_CHANGED

```json
{
  "id": "...",
  "type": "RANKING_CHANGED",
  "classId": "...",
  "occurredAt": "...",
  "payload": {
    "period": "WEEK"
  }
}
```

客户端：

```text
GET /display/bootstrap
```

或未来：

```text
GET /display/ranking
```

MVP 可以直接重新请求 bootstrap。

---

## 11. SEAT_LAYOUT_CHANGED

```json
{
  "id": "...",
  "type": "SEAT_LAYOUT_CHANGED",
  "classId": "...",
  "occurredAt": "...",
  "payload": {
    "version": 19
  }
}
```

客户端：

1. 比较当前 layoutVersion。
2. 如果版本不同，请求最新 bootstrap。
3. 更新座位图。

---

## 12. STUDENT_CHANGED

学生：

- 新增。
- 修改姓名。
- 停用。

```json
{
  "id": "...",
  "type": "STUDENT_CHANGED",
  "classId": "...",
  "occurredAt": "...",
  "payload": {
    "studentId": "...",
    "action": "UPDATED"
  }
}
```

大屏建议重新拉取 bootstrap。

---

## 13. RANDOM_PICKED

随机点名临时事件。

```json
{
  "id": "...",
  "type": "RANDOM_PICKED",
  "classId": "...",
  "occurredAt": "...",
  "payload": {
    "studentId": "...",
    "name": "张三",
    "displayDurationMs": 8000
  }
}
```

大屏：

1. 找到对应 Seat。
2. 高亮。
3. 显示学生姓名。
4. 8 秒后自动恢复。

如果学生当前没有座位：

- 可以在屏幕中央显示点名结果。
- 不应报错。

---

## 14. DISPLAY_CONFIG_CHANGED

预留事件。

MVP 大屏视图偏好主要保存在 LocalStorage，不需要服务端同步。

后续若班主任可以远程控制显示模式，可以启用：

```json
{
  "type": "DISPLAY_CONFIG_CHANGED",
  "payload": {
    "mode": "SEAT_AND_RANKING"
  }
}
```

MVP 可先保留事件定义，不实现后台功能。

---

## 15. SCHEDULE_CHANGED

课表事务保存成功后发布。后台和大屏收到事件后重新请求对应状态；大屏重新请求 `/display/bootstrap`。

```json
{
  "type": "SCHEDULE_CHANGED",
  "payload": { "activeTemplateId": "schedule-template-id" }
}
```

---

## 16. 连接生命周期

### 大屏启动

```text
读取 Device Credential
↓
POST /display/auth/token
↓
获得 Access Token
↓
GET /display/bootstrap
↓
连接 Socket.IO
↓
加入 class room
```

### Socket 断开

UI：

- 在角落显示“连接异常”。
- 保留当前最后一次状态。

Socket.IO 自动重连。

### 重连成功

```text
socket reconnect
↓
GET /display/bootstrap
↓
覆盖当前本地业务状态
↓
恢复“已连接”
```

这样可以处理：

- 漏事件。
- 网络断开。
- 页面休眠。
- 服务重启。

---

## 17. 心跳和在线状态

Socket.IO 自带 ping/pong。

DisplayDevice `lastSeenAt`：

推荐：

- 连接成功更新。
- 每隔 30～60 秒节流更新。
- 断开时无需强依赖即时写库。

后台在线判断：

```text
now - lastSeenAt < 90s
```

则显示在线。

后续也可以把在线状态放 Redis，降低数据库更新频率。

---

## 18. 事件发布接口

业务 Module 不直接依赖 Gateway。

定义：

```ts
export interface ClassRealtimeEvent<T = unknown> {
  id: string;
  type: ClassEventType;
  classId: string;
  occurredAt: string;
  payload: T;
}
```

Service：

```ts
@Injectable()
export class RealtimeService {
  publishClassEvent<T>(classId: string, event: ClassRealtimeEvent<T>): void;
}
```

业务调用：

```ts
await this.scoreService.create(...)

this.realtime.publishClassEvent(classId, {
  id: randomUUID(),
  type: 'SCORE_CHANGED',
  classId,
  occurredAt: new Date().toISOString(),
  payload: {
    studentId,
    direction: delta > 0 ? 'INCREASE' : 'DECREASE',
  },
})
```

---

## 19. 事务与事件顺序

要求：

```text
数据库 Commit
↓
发布 Realtime Event
```

事务失败：

- 不发布。

事件广播失败：

- 数据库状态仍然有效。
- 客户端重连/bootstrap 后可以恢复一致状态。

MVP 不需要引入可靠消息队列。

未来如果实时事件变成关键业务，可引入 Outbox Pattern。

---

## 20. Redis Adapter

单 NestJS 实例：

```text
Socket.IO Memory Adapter
```

多个实例：

```text
Nginx
├── API A
└── API B
       │
       ▼
Redis Adapter
```

这样任意实例发布：

```text
class:{classId}
```

所有连接都能收到。

切换多实例时业务事件协议无需变化。

---

## 21. 客户端封装建议

React 端建立：

```text
RealtimeProvider
```

统一管理：

- connect
- disconnect
- reconnect
- auth token
- event subscription
- connection status

Hook：

```ts
useRealtimeEvent('RANDOM_PICKED', handler);
useRealtimeStatus();
```

页面组件不直接持有 Socket 实例。

---

## 22. MVP 必须实现的事件

最终 P0：

```text
SCORE_CHANGED
SCORE_REVERTED
RANKING_CHANGED
SEAT_LAYOUT_CHANGED
STUDENT_CHANGED
RANDOM_PICKED
```

预留：

```text
DISPLAY_CONFIG_CHANGED
```
