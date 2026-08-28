-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TeacherRole" AS ENUM ('HEAD_TEACHER', 'SUBJECT_TEACHER');

-- CreateEnum
CREATE TYPE "RelationStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ScoreRecordType" AS ENUM ('NORMAL', 'REVERT');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "SessionClientType" AS ENUM ('ADMIN_WEB', 'TEACHER_MOBILE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "account" VARCHAR(100) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Classroom" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "grade" VARCHAR(50),
    "schoolYear" VARCHAR(20),
    "gridRows" INTEGER NOT NULL DEFAULT 6,
    "gridCols" INTEGER NOT NULL DEFAULT 8,
    "currentLayoutVersionId" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassTeacher" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "role" "TeacherRole" NOT NULL,
    "subject" VARCHAR(100),
    "status" "RelationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClassTeacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherInvitation" (
    "id" TEXT NOT NULL,
    "classTeacherId" TEXT NOT NULL,
    "tokenHash" VARCHAR(255) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "studentNo" VARCHAR(50),
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatLayoutVersion" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sourceVersionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatLayoutVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL,
    "layoutVersionId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "colIndex" INTEGER NOT NULL,
    "studentId" TEXT,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreRule" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "delta" INTEGER NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScoreRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreRecord" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "subject" VARCHAR(100),
    "ruleId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" TEXT,
    "recordType" "ScoreRecordType" NOT NULL DEFAULT 'NORMAL',
    "revertedRecordId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayDevice" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisplayDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCredential" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "secretHash" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeviceCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" VARCHAR(255) NOT NULL,
    "clientType" "SessionClientType" NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_currentLayoutVersionId_fkey" FOREIGN KEY ("currentLayoutVersionId") REFERENCES "SeatLayoutVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTeacher" ADD CONSTRAINT "ClassTeacher_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTeacher" ADD CONSTRAINT "ClassTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherInvitation" ADD CONSTRAINT "TeacherInvitation_classTeacherId_fkey" FOREIGN KEY ("classTeacherId") REFERENCES "ClassTeacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatLayoutVersion" ADD CONSTRAINT "SeatLayoutVersion_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatLayoutVersion" ADD CONSTRAINT "SeatLayoutVersion_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "SeatLayoutVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatLayoutVersion" ADD CONSTRAINT "SeatLayoutVersion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_layoutVersionId_fkey" FOREIGN KEY ("layoutVersionId") REFERENCES "SeatLayoutVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreRule" ADD CONSTRAINT "ScoreRule_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreRule" ADD CONSTRAINT "ScoreRule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreRecord" ADD CONSTRAINT "ScoreRecord_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreRecord" ADD CONSTRAINT "ScoreRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreRecord" ADD CONSTRAINT "ScoreRecord_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreRecord" ADD CONSTRAINT "ScoreRecord_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ScoreRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreRecord" ADD CONSTRAINT "ScoreRecord_revertedRecordId_fkey" FOREIGN KEY ("revertedRecordId") REFERENCES "ScoreRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayDevice" ADD CONSTRAINT "DisplayDevice_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCredential" ADD CONSTRAINT "DeviceCredential_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "DisplayDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce domain invariants that Prisma cannot express in schema.prisma.
ALTER TABLE "Classroom"
  ADD CONSTRAINT "Classroom_grid_bounds_check"
  CHECK ("gridRows" BETWEEN 1 AND 20 AND "gridCols" BETWEEN 1 AND 20);

ALTER TABLE "ClassTeacher"
  ADD CONSTRAINT "ClassTeacher_subject_required_check"
  CHECK (
    "role" <> 'SUBJECT_TEACHER'
    OR ("subject" IS NOT NULL AND length(btrim("subject")) > 0)
  );

ALTER TABLE "Seat"
  ADD CONSTRAINT "Seat_non_negative_coordinates_check"
  CHECK ("rowIndex" >= 0 AND "colIndex" >= 0);

ALTER TABLE "ScoreRule"
  ADD CONSTRAINT "ScoreRule_non_zero_delta_check"
  CHECK ("delta" <> 0);

ALTER TABLE "ScoreRecord"
  ADD CONSTRAINT "ScoreRecord_non_zero_delta_check"
  CHECK ("delta" <> 0),
  ADD CONSTRAINT "ScoreRecord_reversion_shape_check"
  CHECK (
    ("recordType" = 'NORMAL' AND "revertedRecordId" IS NULL)
    OR ("recordType" = 'REVERT' AND "revertedRecordId" IS NOT NULL)
  );

CREATE UNIQUE INDEX "ClassTeacher_one_active_head_per_class_key"
  ON "ClassTeacher" ("classId")
  WHERE "role" = 'HEAD_TEACHER' AND "status" = 'ACTIVE';

CREATE UNIQUE INDEX "ClassTeacher_one_active_relation_key"
  ON "ClassTeacher" ("classId", "teacherId")
  WHERE "status" = 'ACTIVE';

