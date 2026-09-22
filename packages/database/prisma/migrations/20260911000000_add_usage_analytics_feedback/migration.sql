CREATE TYPE "UsageClientType" AS ENUM ('DISPLAY', 'ADMIN_WEB', 'TEACHER_MOBILE', 'OTHER');
CREATE TYPE "UsageEventResult" AS ENUM ('SUCCESS', 'FAILURE');
CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'DIFFICULTY', 'DATA_ISSUE', 'FEATURE_REQUEST', 'OTHER');
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "eventName" VARCHAR(100) NOT NULL,
    "clientType" "UsageClientType" NOT NULL,
    "result" "UsageEventResult" NOT NULL DEFAULT 'SUCCESS',
    "classId" TEXT NOT NULL,
    "userId" TEXT,
    "deviceId" TEXT,
    "userRole" "TeacherRole",
    "module" VARCHAR(80),
    "page" VARCHAR(200),
    "appVersion" VARCHAR(50),
    "browser" VARCHAR(255),
    "traceId" VARCHAR(100) NOT NULL,
    "errorCode" VARCHAR(100),
    "properties" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "screenshotUrl" VARCHAR(1000),
    "clientType" "UsageClientType" NOT NULL,
    "classId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "module" VARCHAR(80),
    "page" VARCHAR(200),
    "appVersion" VARCHAR(50),
    "browser" VARCHAR(255),
    "traceId" VARCHAR(100) NOT NULL,
    "processingNote" TEXT,
    "processedById" TEXT,
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Feedback_code_key" UNIQUE ("code"),
    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UsageEvent_classId_occurredAt_idx" ON "UsageEvent"("classId", "occurredAt");
CREATE INDEX "UsageEvent_userId_occurredAt_idx" ON "UsageEvent"("userId", "occurredAt");
CREATE INDEX "UsageEvent_deviceId_occurredAt_idx" ON "UsageEvent"("deviceId", "occurredAt");
CREATE INDEX "UsageEvent_eventName_occurredAt_idx" ON "UsageEvent"("eventName", "occurredAt");
CREATE INDEX "UsageEvent_traceId_idx" ON "UsageEvent"("traceId");
CREATE INDEX "Feedback_classId_createdAt_idx" ON "Feedback"("classId", "createdAt");
CREATE INDEX "Feedback_classId_status_createdAt_idx" ON "Feedback"("classId", "status", "createdAt");
CREATE INDEX "Feedback_submittedById_createdAt_idx" ON "Feedback"("submittedById", "createdAt");
CREATE INDEX "Feedback_traceId_idx" ON "Feedback"("traceId");

ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "DisplayDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
