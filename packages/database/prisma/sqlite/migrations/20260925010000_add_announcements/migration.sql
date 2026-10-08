ALTER TABLE "DisplayDevice" ADD COLUMN "soundReady" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DisplayDevice" ADD COLUMN "soundReadyAt" DATETIME;

CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "classId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "studentId" TEXT,
  "studentName" TEXT,
  "teacherName" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "repeatCount" INTEGER NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'WAITING_DISPLAY',
  "idempotencyKey" TEXT NOT NULL,
  "primaryDeviceId" TEXT NOT NULL,
  "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" DATETIME,
  "endedAt" DATETIME,
  "endReason" TEXT,
  CONSTRAINT "Announcement_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Announcement_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Announcement_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "AnnouncementLock" (
  "classId" TEXT NOT NULL PRIMARY KEY,
  "announcementId" TEXT NOT NULL,
  CONSTRAINT "AnnouncementLock_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AnnouncementLock_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "AnnouncementDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "announcementId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "displayedAt" DATETIME,
  "expiresAt" DATETIME,
  "inputStartedAt" DATETIME,
  "inputUntil" DATETIME,
  "pausedRemainingMs" INTEGER,
  "pauseUsed" BOOLEAN NOT NULL DEFAULT false,
  "soundStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "playedCount" INTEGER NOT NULL DEFAULT 0,
  "endReason" TEXT,
  CONSTRAINT "AnnouncementDelivery_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AnnouncementDelivery_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "DisplayDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "AnnouncementReply" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "announcementId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementReply_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AnnouncementReply_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "DisplayDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Announcement_teacherId_idempotencyKey_key" ON "Announcement"("teacherId", "idempotencyKey");
CREATE INDEX "Announcement_classId_sentAt_idx" ON "Announcement"("classId", "sentAt");
CREATE INDEX "Announcement_status_sentAt_idx" ON "Announcement"("status", "sentAt");
CREATE UNIQUE INDEX "AnnouncementLock_announcementId_key" ON "AnnouncementLock"("announcementId");
CREATE UNIQUE INDEX "AnnouncementDelivery_announcementId_deviceId_key" ON "AnnouncementDelivery"("announcementId", "deviceId");
CREATE INDEX "AnnouncementDelivery_deviceId_announcementId_idx" ON "AnnouncementDelivery"("deviceId", "announcementId");
CREATE UNIQUE INDEX "AnnouncementReply_announcementId_key" ON "AnnouncementReply"("announcementId");
CREATE UNIQUE INDEX "AnnouncementReply_deviceId_idempotencyKey_key" ON "AnnouncementReply"("deviceId", "idempotencyKey");
