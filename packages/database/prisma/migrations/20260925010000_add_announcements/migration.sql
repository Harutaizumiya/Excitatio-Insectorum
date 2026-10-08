ALTER TABLE "DisplayDevice" ADD COLUMN "soundReady" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DisplayDevice" ADD COLUMN "soundReadyAt" TIMESTAMPTZ(3);

CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "classId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "studentId" TEXT,
  "studentName" VARCHAR(100),
  "teacherName" VARCHAR(100) NOT NULL,
  "mode" VARCHAR(20) NOT NULL,
  "text" VARCHAR(240) NOT NULL,
  "repeatCount" INTEGER NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'WAITING_DISPLAY',
  "idempotencyKey" VARCHAR(100) NOT NULL,
  "primaryDeviceId" TEXT NOT NULL,
  "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMPTZ(3),
  "endedAt" TIMESTAMPTZ(3),
  "endReason" VARCHAR(30)
);
CREATE TABLE "AnnouncementLock" (
  "classId" TEXT NOT NULL PRIMARY KEY,
  "announcementId" TEXT NOT NULL
);
CREATE TABLE "AnnouncementDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "announcementId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "displayedAt" TIMESTAMPTZ(3),
  "expiresAt" TIMESTAMPTZ(3),
  "inputStartedAt" TIMESTAMPTZ(3),
  "inputUntil" TIMESTAMPTZ(3),
  "pausedRemainingMs" INTEGER,
  "pauseUsed" BOOLEAN NOT NULL DEFAULT false,
  "soundStatus" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  "playedCount" INTEGER NOT NULL DEFAULT 0,
  "endReason" VARCHAR(30)
);
CREATE TABLE "AnnouncementReply" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "announcementId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "type" VARCHAR(20) NOT NULL,
  "text" VARCHAR(100) NOT NULL,
  "idempotencyKey" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Announcement_teacherId_idempotencyKey_key" ON "Announcement"("teacherId", "idempotencyKey");
CREATE INDEX "Announcement_classId_sentAt_idx" ON "Announcement"("classId", "sentAt");
CREATE INDEX "Announcement_status_sentAt_idx" ON "Announcement"("status", "sentAt");
CREATE UNIQUE INDEX "AnnouncementLock_announcementId_key" ON "AnnouncementLock"("announcementId");
CREATE UNIQUE INDEX "AnnouncementDelivery_announcementId_deviceId_key" ON "AnnouncementDelivery"("announcementId", "deviceId");
CREATE INDEX "AnnouncementDelivery_deviceId_announcementId_idx" ON "AnnouncementDelivery"("deviceId", "announcementId");
CREATE UNIQUE INDEX "AnnouncementReply_announcementId_key" ON "AnnouncementReply"("announcementId");
CREATE UNIQUE INDEX "AnnouncementReply_deviceId_idempotencyKey_key" ON "AnnouncementReply"("deviceId", "idempotencyKey");

ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnnouncementLock" ADD CONSTRAINT "AnnouncementLock_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementLock" ADD CONSTRAINT "AnnouncementLock_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementDelivery" ADD CONSTRAINT "AnnouncementDelivery_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementDelivery" ADD CONSTRAINT "AnnouncementDelivery_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "DisplayDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnouncementReply" ADD CONSTRAINT "AnnouncementReply_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementReply" ADD CONSTRAINT "AnnouncementReply_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "DisplayDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
