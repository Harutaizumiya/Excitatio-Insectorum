# 04 API 设计文档

## 1. API 约定

Base URL：

```text
/api/v1
```

Content-Type：

```text
application/json
```

认证：

```text
Authorization: Bearer <access_token>
```

统一响应推荐保持简单。

成功：

```json
{
  "data": {}
}
```

分页：

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}
```

失败：

```json
{
  "code": "STUDENT_NOT_FOUND",
  "message": "学生不存在",
  "requestId": "..."
}
```

---

## 2. Auth API

### POST /auth/login

班主任账号密码登录。

Request：

```json
{
  "account": "teacher01",
  "password": "******"
}
```

Response：

```json
{
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "user": {
      "id": "...",
      "name": "王老师"
    }
  }
}
```

### POST /auth/refresh

Request：

```json
{
  "refreshToken": "..."
}
```

Response：

```json
{
  "data": {
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

### POST /auth/logout

吊销当前 Session。

### POST /auth/invitations/:token/consume

任课教师首次使用邀请链接。

Request：

```json
{
  "deviceName": "iPhone Safari"
}
```

Response：

```json
{
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "classroom": {
      "id": "...",
      "name": "高一（3）班"
    },
    "teacher": {
      "id": "...",
      "name": "王老师",
      "subject": "数学"
    }
  }
}
```

错误：

```text
INVITATION_NOT_FOUND
INVITATION_EXPIRED
INVITATION_ALREADY_USED
INVITATION_REVOKED
```

---

## 3. Classroom API

### GET /classes

返回当前用户可访问的班级。

### GET /classes/:classId

获取班级基础信息。

### PATCH /classes/:classId

权限：HEAD_TEACHER。

可修改：

```json
{
  "name": "高一（3）班",
  "grade": "高一",
  "schoolYear": "2026",
  "gridRows": 6,
  "gridCols": 8
}
```

调整网格尺寸时必须校验当前 Seat 是否越界。

---

## 4. Student API

### GET /classes/:classId/students

Query：

```text
status=ACTIVE
keyword=张
page=1
pageSize=20
```

权限：

- HEAD_TEACHER
- SUBJECT_TEACHER

### POST /classes/:classId/students

权限：HEAD_TEACHER。

Request：

```json
{
  "name": "张三",
  "studentNo": "1001"
}
```

### PATCH /classes/:classId/students/:studentId

权限：HEAD_TEACHER。

### POST /classes/:classId/students/:studentId/deactivate

权限：HEAD_TEACHER。

行为：

- Student.status = INACTIVE
- 从当前 Seat Layout 中解除学生关联的处理应由业务层完成或要求重新保存布局。
- 历史数据保留。

---

## 5. Teacher API

### GET /classes/:classId/teachers

权限：HEAD_TEACHER。

### POST /classes/:classId/teachers

权限：HEAD_TEACHER。

Request：

```json
{
  "name": "李老师",
  "subject": "数学"
}
```

Response：

```json
{
  "data": {
    "classTeacherId": "...",
    "teacherId": "..."
  }
}
```

### PATCH /classes/:classId/teachers/:classTeacherId

权限：HEAD_TEACHER。

可修改：

- 姓名。
- subject。

### POST /classes/:classId/teachers/:classTeacherId/revoke

权限：HEAD_TEACHER。

行为：

- ClassTeacher.status = REVOKED
- 吊销相关 Session。

### POST /classes/:classId/teachers/:classTeacherId/invitations

权限：HEAD_TEACHER。

Response：

```json
{
  "data": {
    "inviteUrl": "https://example.com/invite/...",
    "expiresAt": "2026-08-26T10:00:00Z"
  }
}
```

---

## 6. Seat Layout API

### GET /classes/:classId/seat-layout

权限：

- HEAD_TEACHER
- SUBJECT_TEACHER

Response：

```json
{
  "data": {
    "versionId": "...",
    "version": 18,
    "rows": 6,
    "cols": 8,
    "seats": [
      {
        "id": "...",
        "row": 0,
        "col": 0,
        "student": {
          "id": "...",
          "name": "张三"
        }
      },
      {
        "id": "...",
        "row": 0,
        "col": 2,
        "student": null
      }
    ]
  }
}
```

### PUT /classes/:classId/seat-layout

权限：HEAD_TEACHER。

一次性保存完整新版本。

Request：

```json
{
  "seats": [
    {
      "row": 0,
      "col": 0,
      "studentId": "student-1"
    },
    {
      "row": 0,
      "col": 2,
      "studentId": null
    }
  ]
}
```

校验：

- Cell 不重复。
- 坐标不越界。
- Student 必须属于本班。
- Student 必须 ACTIVE。
- 同一 Student 不能出现两次。

Response：

```json
{
  "data": {
    "versionId": "...",
    "version": 19
  }
}
```

成功后广播：

```text
SEAT_LAYOUT_CHANGED
```

### GET /classes/:classId/seat-layout/versions

权限：HEAD_TEACHER。

### GET /classes/:classId/seat-layout/versions/:versionId

权限：HEAD_TEACHER。

### POST /classes/:classId/seat-layout/versions/:versionId/restore

权限：HEAD_TEACHER。

行为：

- 复制目标版本。
- 创建最新 Version。
- 修改 currentLayoutVersionId。
- 广播 SEAT_LAYOUT_CHANGED。

---

## 7. Score Rule API

### GET /classes/:classId/score-rules

权限：

- HEAD_TEACHER
- SUBJECT_TEACHER

Query：

```text
enabled=true
```

### POST /classes/:classId/score-rules

权限：HEAD_TEACHER。

Request：

```json
{
  "name": "回答问题",
  "delta": 2,
  "description": "课堂主动回答问题"
}
```

### PATCH /classes/:classId/score-rules/:ruleId

权限：HEAD_TEACHER。

### POST /classes/:classId/score-rules/:ruleId/disable

权限：HEAD_TEACHER。

---

## 8. Score Record API

### POST /classes/:classId/scores/rule

使用规则积分。

权限：

- HEAD_TEACHER
- SUBJECT_TEACHER

Request：

```json
{
  "studentId": "...",
  "ruleId": "..."
}
```

服务端：

- 查询 ScoreRule。
- 使用规则当前 delta。
- 创建 ScoreRecord。
- 保存 operatorId。
- 保存 subject。
- 成功后广播 SCORE_CHANGED。
- 如 Top3/趋势受影响，可同步广播 RANKING_CHANGED。

### POST /classes/:classId/scores/custom

自定义积分。

Request：

```json
{
  "studentId": "...",
  "delta": 5,
  "reason": "课堂完成高难度题目并帮助其他同学理解解法"
}
```

规则：

- delta != 0
- reason >= 10 字符

### GET /classes/:classId/scores

Query：

```text
studentId=
operatorId=
from=
to=
page=
pageSize=
```

权限：

- HEAD_TEACHER
- SUBJECT_TEACHER

Response 每条包含：

```json
{
  "id": "...",
  "student": {
    "id": "...",
    "name": "张三"
  },
  "operator": {
    "id": "...",
    "name": "王老师"
  },
  "subject": "数学",
  "rule": {
    "id": "...",
    "name": "回答问题"
  },
  "delta": 2,
  "reason": null,
  "recordType": "NORMAL",
  "reverted": false,
  "createdAt": "..."
}
```

### POST /classes/:classId/scores/:recordId/revert

权限：

HEAD_TEACHER：

- 本班任意可撤销 NORMAL Record。

SUBJECT_TEACHER：

- operatorId 必须等于当前用户 ID。

错误：

```text
SCORE_RECORD_NOT_FOUND
SCORE_RECORD_ALREADY_REVERTED
SCORE_RECORD_NOT_REVERTIBLE
FORBIDDEN_SCORE_REVERT
```

成功后广播：

```text
SCORE_REVERTED
RANKING_CHANGED
```

---

## 9. Ranking API

### GET /classes/:classId/ranking

MVP 固定周周期。

Response：

```json
{
  "data": {
    "period": {
      "type": "WEEK",
      "startAt": "...",
      "endAt": "..."
    },
    "top3": [
      {
        "studentId": "...",
        "name": "张三",
        "rank": 1
      }
    ],
    "progress": [
      {
        "studentId": "...",
        "name": "李四",
        "previousRank": 15,
        "currentRank": 6,
        "change": 9
      }
    ],
    "strategy": "WEEK_OVER_WEEK_RANK_CHANGE"
  }
}
```

注意：

- 大屏专用接口不返回 score。
- 管理端未来如需具体 score，可建立单独管理接口。

---

## 10. Random Pick API

### POST /classes/:classId/random-pick

权限：

- HEAD_TEACHER
- SUBJECT_TEACHER

可选 Request：

```json
{
  "excludeStudentIds": ["...", "..."]
}
```

Response：

```json
{
  "data": {
    "student": {
      "id": "...",
      "name": "张三"
    }
  }
}
```

成功后广播：

```text
RANDOM_PICKED
```

---

## 11. Display Binding API

### POST /display/binding-codes

无需设备身份。

用途：

- 大屏首次打开请求绑定码。

Response：

```json
{
  "data": {
    "code": "583921",
    "expiresAt": "...",
    "bindingSessionId": "..."
  }
}
```

需要 Rate Limit。

### POST /classes/:classId/display-devices/bind

权限：HEAD_TEACHER。

Request：

```json
{
  "code": "583921",
  "name": "教室智慧黑板"
}
```

规则：

- code 有效。
- 每班 ACTIVE 设备 < 2。

Response：

```json
{
  "data": {
    "deviceId": "..."
  }
}
```

设备凭证通过绑定 Session 的轮询或专用 WebSocket 通知安全返回给大屏。

### GET /classes/:classId/display-devices

权限：HEAD_TEACHER。

### POST /classes/:classId/display-devices/:deviceId/revoke

权限：HEAD_TEACHER。

---

## 12. Device Auth API

### POST /display/auth/token

使用长期 Device Credential 换短期 Access Token。

Request：

```json
{
  "deviceId": "...",
  "credential": "..."
}
```

Response：

```json
{
  "data": {
    "accessToken": "...",
    "expiresIn": 1800
  }
}
```

---

## 13. Display Bootstrap API

### GET /display/bootstrap

权限：DISPLAY_DEVICE。

classId 从 Token 获取，不接受客户端任意指定。

Response：

```json
{
  "data": {
    "classroom": {
      "id": "...",
      "name": "高一（3）班",
      "gridRows": 6,
      "gridCols": 8
    },
    "layout": {
      "version": 18,
      "seats": [
        {
          "row": 0,
          "col": 0,
          "student": {
            "id": "...",
            "name": "张三"
          }
        }
      ]
    },
    "ranking": {
      "top3": [
        {
          "studentId": "...",
          "name": "张三",
          "rank": 1
        }
      ],
      "progress": [
        {
          "studentId": "...",
          "name": "李四",
          "change": 9
        }
      ]
    }
  }
}
```

隐私：

- 不返回学生具体积分。

---

## 14. API 幂等与并发

### Seat Layout

每次保存创建新版本。

可增加：

```text
baseVersion
```

客户端提交：

```json
{
  "baseVersion": 18,
  "seats": [...]
}
```

若当前服务器版本已经 19：

```text
409 SEAT_LAYOUT_VERSION_CONFLICT
```

防止两个页面覆盖。

### Score Revert

数据库层防止重复撤销。

### Display Bind

绑定码成功消费后立即失效。

### Invitation Consume

一次性消费，数据库事务保证。

---

## 15. API 文档最终事实来源

本文件描述业务边界。

具体 DTO、Schema 和 Response 以 NestJS Swagger / OpenAPI 为最终事实来源。
