-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Classroom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "grade" TEXT,
    "schoolYear" TEXT,
    "gridRows" INTEGER NOT NULL DEFAULT 7,
    "gridCols" INTEGER NOT NULL DEFAULT 11,
    "currentLayoutVersionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Classroom_currentLayoutVersionId_fkey" FOREIGN KEY ("currentLayoutVersionId") REFERENCES "SeatLayoutVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassTeacher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClassTeacher_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClassTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeacherInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classTeacherId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherInvitation_classTeacherId_fkey" FOREIGN KEY ("classTeacherId") REFERENCES "ClassTeacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "studentNo" TEXT,
    "gender" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SeatLayoutVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sourceVersionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeatLayoutVersion_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SeatLayoutVersion_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "SeatLayoutVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SeatLayoutVersion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "layoutVersionId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "colIndex" INTEGER NOT NULL,
    "studentId" TEXT,
    "cellType" TEXT NOT NULL DEFAULT 'SEAT',
    CONSTRAINT "Seat_layoutVersionId_fkey" FOREIGN KEY ("layoutVersionId") REFERENCES "SeatLayoutVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Seat_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoreRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT '课堂表现',
    "delta" INTEGER NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScoreRule_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScoreRule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoreRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "subject" TEXT,
    "ruleId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" TEXT,
    "recordType" TEXT NOT NULL DEFAULT 'NORMAL',
    "revertedRecordId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScoreRecord_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScoreRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScoreRecord_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScoreRecord_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ScoreRule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScoreRecord_revertedRecordId_fkey" FOREIGN KEY ("revertedRecordId") REFERENCES "ScoreRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DisplayDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisplayDevice_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeviceCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    CONSTRAINT "DeviceCredential_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "DisplayDevice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "clientType" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_account_key" ON "User"("account");

-- CreateIndex
CREATE UNIQUE INDEX "Classroom_currentLayoutVersionId_key" ON "Classroom"("currentLayoutVersionId");

-- CreateIndex
CREATE INDEX "Classroom_status_idx" ON "Classroom"("status");

-- CreateIndex
CREATE INDEX "ClassTeacher_classId_status_idx" ON "ClassTeacher"("classId", "status");

-- CreateIndex
CREATE INDEX "ClassTeacher_teacherId_status_idx" ON "ClassTeacher"("teacherId", "status");

-- CreateIndex
CREATE INDEX "ClassTeacher_classId_role_status_idx" ON "ClassTeacher"("classId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherInvitation_tokenHash_key" ON "TeacherInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "TeacherInvitation_classTeacherId_idx" ON "TeacherInvitation"("classTeacherId");

-- CreateIndex
CREATE INDEX "TeacherInvitation_expiresAt_idx" ON "TeacherInvitation"("expiresAt");

-- CreateIndex
CREATE INDEX "TeacherInvitation_status_expiresAt_idx" ON "TeacherInvitation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Student_classId_status_idx" ON "Student"("classId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Student_classId_studentNo_key" ON "Student"("classId", "studentNo");

-- CreateIndex
CREATE INDEX "SeatLayoutVersion_classId_createdAt_idx" ON "SeatLayoutVersion"("classId", "createdAt");

-- CreateIndex
CREATE INDEX "SeatLayoutVersion_sourceVersionId_idx" ON "SeatLayoutVersion"("sourceVersionId");

-- CreateIndex
CREATE INDEX "SeatLayoutVersion_createdBy_idx" ON "SeatLayoutVersion"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "SeatLayoutVersion_classId_version_key" ON "SeatLayoutVersion"("classId", "version");

-- CreateIndex
CREATE INDEX "Seat_layoutVersionId_idx" ON "Seat"("layoutVersionId");

-- CreateIndex
CREATE INDEX "Seat_studentId_idx" ON "Seat"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_layoutVersionId_rowIndex_colIndex_key" ON "Seat"("layoutVersionId", "rowIndex", "colIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_layoutVersionId_studentId_key" ON "Seat"("layoutVersionId", "studentId");

-- CreateIndex
CREATE INDEX "ScoreRule_classId_enabled_idx" ON "ScoreRule"("classId", "enabled");

-- CreateIndex
CREATE INDEX "ScoreRule_createdBy_idx" ON "ScoreRule"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreRecord_revertedRecordId_key" ON "ScoreRecord"("revertedRecordId");

-- CreateIndex
CREATE INDEX "ScoreRecord_classId_createdAt_idx" ON "ScoreRecord"("classId", "createdAt");

-- CreateIndex
CREATE INDEX "ScoreRecord_studentId_createdAt_idx" ON "ScoreRecord"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "ScoreRecord_operatorId_createdAt_idx" ON "ScoreRecord"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "ScoreRecord_classId_studentId_createdAt_idx" ON "ScoreRecord"("classId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "ScoreRecord_ruleId_idx" ON "ScoreRecord"("ruleId");

-- CreateIndex
CREATE INDEX "ScoreRecord_revertedRecordId_idx" ON "ScoreRecord"("revertedRecordId");

-- CreateIndex
CREATE INDEX "DisplayDevice_classId_status_idx" ON "DisplayDevice"("classId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCredential_secretHash_key" ON "DeviceCredential"("secretHash");

-- CreateIndex
CREATE INDEX "DeviceCredential_deviceId_idx" ON "DeviceCredential"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceCredential_deviceId_revokedAt_idx" ON "DeviceCredential"("deviceId", "revokedAt");

-- CreateIndex
CREATE INDEX "DeviceCredential_expiresAt_idx" ON "DeviceCredential"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
