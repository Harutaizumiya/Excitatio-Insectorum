# 02 领域模型与数据库设计

## 1. 数据库选型

- SQLite（当前版本默认启用）
- PostgreSQL（保留兼容支持，按需切换）
- ORM：Prisma
- Migration：Prisma Migrate
- 所有时间统一使用 UTC 存储。
- 对外展示时由客户端按时区转换。

---

## 2. 核心实体

MVP 核心表：

1. User
2. Classroom
3. ClassTeacher
4. TeacherInvitation
5. Student
6. Dormitory
7. SeatLayoutVersion
8. Seat
9. ScoreRule
10. ScorePeriod / ScoreEvent / ScoreEventParticipant
11. ScoreRecord
12. ClassCommitteeAssignment
13. DisplayDevice
14. ScheduleTemplate
15. ScheduleTemplatePeriod
16. ScheduleEntry

建议额外保留：

11. RefreshToken / Session
12. DeviceCredential

是否拆成独立表由最终认证实现决定。

---

## 3. ER 关系

```text
User
│
├── 1:N ── ClassTeacher ── N:1 ── Classroom
│                               │
│                               ├── 1:N Student
│                               ├── 1:N Dormitory ── 1:N Student
│                               ├── 1:N SeatLayoutVersion
│                               │          └── 1:N Seat
│                               ├── 1:N ScoreRule
│                               ├── 1:N ScoreRecord
│                               ├── 1:N ClassCommitteeAssignment
│                               ├── 1:N ScheduleTemplate
│                               │          └── 1:N ScheduleTemplatePeriod
│                               ├── 1:N ScheduleEntry
│                               └── 1:N DisplayDevice
│
└── 1:N TeacherInvitation
```

---

## 4. User

表示教师用户身份。

```text
User
- id
- name
- account
- passwordHash
- status
- createdAt
- updatedAt
```

建议：

```text
status:
ACTIVE
DISABLED
```

约束：

- `account` 唯一。
- User 本身不存储班级角色。
- 班级角色存在 ClassTeacher。

---

## 5. Classroom

```text
Classroom
- id
- name
- grade
- schoolYear
- gridRows
- gridCols
- currentLayoutVersionId
- activeScheduleTemplateId
- status
- createdAt
- updatedAt
```

约束：

- `gridRows >= 1`
- `gridCols >= 1`
- 当前 MVP 建议限制最大值，例如 `20 × 20`。
- `currentLayoutVersionId` 可为空，表示尚未建立座位布局。
- `activeScheduleTemplateId` 可为空，表示尚未建立课表；当前模板覆盖整周课程。

### 5.1 课表

`ScheduleTemplate` 保存班级作息模板，`ScheduleTemplatePeriod` 保存节次时间，`ScheduleEntry` 保存周一至周日的课程格子。

```text
ScheduleTemplate: id, classId, name
ScheduleTemplatePeriod: id, templateId, periodNo, startTime, endTime
ScheduleEntry: id, classId, weekday, periodNo, courseName, classTeacherId?
```

模板最多 12 节，节次编号一致；时间使用 `HH:mm` 且不得重叠；课程格子以 `classId + weekday + periodNo` 唯一；任课教师必须是本班 ACTIVE `ClassTeacher`。

---

## 6. ClassTeacher

教师和班级之间的关系表。

```text
ClassTeacher
- id
- classId
- teacherId
- role
- subject
- status
- createdAt
- updatedAt
```

枚举：

```text
role:
HEAD_TEACHER
SUBJECT_TEACHER

status:
ACTIVE
REVOKED
```

业务约束：

- 一个班级最多一个 ACTIVE `HEAD_TEACHER`。
- 同一教师与同一班级避免创建重复 ACTIVE 关系。
- 任课教师的 `subject` 必填。
- 班主任 `subject` 可以为空。

建议索引：

```text
INDEX(classId, status)
INDEX(teacherId, status)
UNIQUE(classId, teacherId) 或应用层处理历史关系
```

如果需要完整保留教师多次加入/退出历史，可不使用简单 UNIQUE，改为关系版本或状态记录。

---

## 7. TeacherInvitation

任课教师首次绑定身份的一次性邀请。

```text
TeacherInvitation
- id
- classTeacherId
- tokenHash
- expiresAt
- usedAt
- status
- createdAt
```

状态：

```text
PENDING
USED
EXPIRED
REVOKED
```

规则：

- 邀请 Token 原文只在生成时返回一次。
- 数据库只保存 hash。
- 默认 24 小时过期。
- 只能成功消费一次。
- 消费成功后写入 `usedAt`。

索引：

```text
UNIQUE(tokenHash)
INDEX(classTeacherId)
INDEX(expiresAt)
```

---

## 8. Student

```text
Student
- id
- classId
- dormitoryId?
- name
- studentNo
- status
- createdAt
- updatedAt
```

状态：

```text
ACTIVE
INACTIVE
```

规则：

- 离班只更新状态。
- 不删除积分流水。
- 不删除座位历史。
- 当前有效座位布局中应移除 INACTIVE 学生。

建议索引：

```text
INDEX(classId, status)
UNIQUE(classId, studentNo)  // studentNo 存在时
```

### 8.1 Dormitory

```text
Dormitory
- id
- classId
- name
- createdAt
- updatedAt
```

约束：同班寝室名唯一；`Student.classId + dormitoryId` 通过复合外键保证不能跨班归属。删除寝室时先清空成员当前归属，历史积分事件保留寝室名称快照。

---

## 9. SeatLayoutVersion

表示一个完整座位布局快照。

```text
SeatLayoutVersion
- id
- classId
- version
- sourceVersionId
- rotationWeekKey?
- createdBy
- createdAt
```

规则：

- `version` 在同班级内单调递增。
- 每次“保存布局”创建新版本。
- 恢复历史版本时复制目标版本，生成最新版本。
- `sourceVersionId` 用于记录恢复来源，可为空。
- 自动轮换版本写入台北时区周一日期作为 `rotationWeekKey`。
- 不更新历史版本内容。

约束：

```text
UNIQUE(classId, version)
UNIQUE(classId, rotationWeekKey)
INDEX(classId, createdAt)
```

---

## 10. Seat

Seat 属于某个座位布局版本。

```text
Seat
- id
- layoutVersionId
- rowIndex
- colIndex
- studentId
```

语义：

- 没有 Seat 记录：该网格单元没有座位。
- 有 Seat 且 studentId = NULL：空座位。
- 有 Seat 且 studentId != NULL：学生座位。

约束：

```text
UNIQUE(layoutVersionId, rowIndex, colIndex)
```

应用层校验：

- `0 <= rowIndex < Classroom.gridRows`
- `0 <= colIndex < Classroom.gridCols`
- 同一版本中一个 ACTIVE Student 最多出现一次。

建议索引：

```text
INDEX(layoutVersionId)
INDEX(studentId)
```

---

## 11. ScoreRule

```text
ScoreRule
- id
- classId
- name
- delta
- description
- enabled
- createdBy
- createdAt
- updatedAt
```

规则：

- `delta` 为非 0 整数。
- 支持正数和负数。
- 规则属于班级。
- 任课教师无修改权限。

索引：

```text
INDEX(classId, enabled)
```

---

## 12. ScoreRecord

系统最重要的审计数据之一。

```text
ScoreRecord
- id
- classId
- studentId
- operatorId
- subject
- ruleId
- delta
- reason
- recordType
- revertedRecordId
- createdAt
```

枚举：

```text
recordType:
NORMAL
REVERT
```

普通规则积分：

```text
ruleId != NULL
delta = 规则实际分值
reason 可为空
recordType = NORMAL
```

自定义积分：

```text
ruleId = NULL
delta != 0
reason 必填
recordType = NORMAL
```

撤销：

```text
recordType = REVERT
revertedRecordId = 原记录 ID
delta = -原记录.delta
ruleId 可复制原记录或为空，建议复制
reason = 系统生成撤销说明或操作说明
```

关键约束：

- 原始流水不可删除。
- 一个可撤销记录只允许存在一条有效 REVERT。
- REVERT 记录不允许再次撤销。
- `classId` 必须与 Student 所属班级一致。
- `operatorId` 必须在该班级拥有有效教师关系。
- 任课教师只能撤销自己创建的 NORMAL 记录。

建议索引：

```text
INDEX(classId, createdAt)
INDEX(studentId, createdAt)
INDEX(operatorId, createdAt)
INDEX(classId, studentId, createdAt)
INDEX(revertedRecordId)
```

排行榜重点使用：

```text
(classId, createdAt)
(classId, studentId, createdAt)
```

---

## 13. DisplayDevice

```text
DisplayDevice
- id
- classId
- name
- status
- lastSeenAt
- createdAt
- revokedAt
```

状态：

```text
ACTIVE
REVOKED
```

设备凭证建议独立：

```text
DeviceCredential
- id
- deviceId
- secretHash
- createdAt
- expiresAt
- revokedAt
```

如果第一版为了减少表数量，也可以把 `credentialHash` 放到 DisplayDevice。

业务约束：

- 每个班级最多 2 个 ACTIVE DisplayDevice。
- 每个设备独立凭证。
- 吊销设备后该设备不能再换取新的访问 Token。

索引：

```text
INDEX(classId, status)
```

---

## 14. Refresh Token / Session

推荐服务器持有可吊销 Session。

```text
Session
- id
- userId
- refreshTokenHash
- clientType
- expiresAt
- revokedAt
- createdAt
- lastUsedAt
```

客户端类型：

```text
ADMIN_WEB
TEACHER_MOBILE
```

好处：

- 班主任可主动撤销任课教师长期登录状态。
- Token 泄露后可失效。
- 支持设备级会话管理。

---

## 15. Prisma 模型骨架

```prisma
enum UserStatus {
  ACTIVE
  DISABLED
}

enum TeacherRole {
  HEAD_TEACHER
  SUBJECT_TEACHER
}

enum RelationStatus {
  ACTIVE
  REVOKED
}

enum StudentStatus {
  ACTIVE
  INACTIVE
}

enum ScoreRecordType {
  NORMAL
  REVERT
}

enum DeviceStatus {
  ACTIVE
  REVOKED
}

model User {
  id           String         @id @default(cuid())
  name         String
  account      String         @unique
  passwordHash String
  status       UserStatus     @default(ACTIVE)
  classLinks   ClassTeacher[]
  scoreRecords ScoreRecord[]
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
}

model Classroom {
  id                     String              @id @default(cuid())
  name                   String
  grade                  String?
  schoolYear             String?
  gridRows               Int                 @default(6)
  gridCols               Int                 @default(8)
  currentLayoutVersionId String?
  teachers               ClassTeacher[]
  students               Student[]
  layouts                SeatLayoutVersion[]
  scoreRules             ScoreRule[]
  scoreRecords           ScoreRecord[]
  displayDevices         DisplayDevice[]
  createdAt              DateTime            @default(now())
  updatedAt              DateTime            @updatedAt
}

model ClassTeacher {
  id        String         @id @default(cuid())
  classId   String
  teacherId String
  role      TeacherRole
  subject   String?
  status    RelationStatus @default(ACTIVE)
  classroom Classroom      @relation(fields: [classId], references: [id])
  teacher   User           @relation(fields: [teacherId], references: [id])
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@index([classId, status])
  @@index([teacherId, status])
}

model Student {
  id        String        @id @default(cuid())
  classId   String
  name      String
  studentNo String?
  status    StudentStatus @default(ACTIVE)
  classroom Classroom     @relation(fields: [classId], references: [id])
  seats     Seat[]
  scores    ScoreRecord[]
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  @@index([classId, status])
}

model SeatLayoutVersion {
  id              String    @id @default(cuid())
  classId         String
  version         Int
  sourceVersionId String?
  createdBy       String
  classroom       Classroom @relation(fields: [classId], references: [id])
  seats           Seat[]
  createdAt       DateTime  @default(now())

  @@unique([classId, version])
  @@index([classId, createdAt])
}

model Seat {
  id              String            @id @default(cuid())
  layoutVersionId String
  rowIndex        Int
  colIndex        Int
  studentId       String?
  layout          SeatLayoutVersion @relation(fields: [layoutVersionId], references: [id])
  student         Student?          @relation(fields: [studentId], references: [id])

  @@unique([layoutVersionId, rowIndex, colIndex])
  @@index([layoutVersionId])
}

model ScoreRule {
  id          String    @id @default(cuid())
  classId     String
  name        String
  delta       Int
  description String?
  enabled     Boolean   @default(true)
  createdBy   String
  classroom   Classroom @relation(fields: [classId], references: [id])
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([classId, enabled])
}

model ScoreRecord {
  id               String          @id @default(cuid())
  classId          String
  studentId        String
  operatorId       String
  subject          String?
  ruleId           String?
  delta            Int
  reason           String?
  recordType       ScoreRecordType @default(NORMAL)
  revertedRecordId String?
  classroom        Classroom       @relation(fields: [classId], references: [id])
  student          Student         @relation(fields: [studentId], references: [id])
  operator         User            @relation(fields: [operatorId], references: [id])
  createdAt        DateTime        @default(now())

  @@index([classId, createdAt])
  @@index([studentId, createdAt])
  @@index([operatorId, createdAt])
  @@index([revertedRecordId])
}

model DisplayDevice {
  id         String       @id @default(cuid())
  classId    String
  name       String
  status     DeviceStatus @default(ACTIVE)
  lastSeenAt DateTime?
  revokedAt  DateTime?
  classroom  Classroom    @relation(fields: [classId], references: [id])
  createdAt  DateTime     @default(now())

  @@index([classId, status])
}
```

---

## 16. 事务边界

必须使用事务的场景：

### 保存座位布局

```text
BEGIN
→ 查询当前最大 version
→ 创建 SeatLayoutVersion
→ 批量创建 Seat
→ 更新 Classroom.currentLayoutVersionId
COMMIT
```

### 恢复座位布局

```text
BEGIN
→ 读取目标历史版本
→ 创建新版本
→ 复制 Seat 快照
→ 更新 currentLayoutVersionId
COMMIT
```

### 撤销积分

```text
BEGIN
→ 锁定原 ScoreRecord
→ 检查尚未撤销
→ 创建 REVERT Record
COMMIT
```

---

## 17. 数据删除策略

物理删除仅用于：

- 尚未产生业务历史的错误数据。
- 开发和测试环境。

业务数据默认：

- Student：状态停用。
- ClassTeacher：状态撤销。
- DisplayDevice：状态撤销。
- ScoreRecord：永久保留。
- SeatLayoutVersion：永久保留。
