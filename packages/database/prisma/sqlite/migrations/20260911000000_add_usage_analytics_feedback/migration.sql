CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventName" TEXT NOT NULL,
    "clientType" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'SUCCESS',
    "classId" TEXT NOT NULL,
    "userId" TEXT,
    "deviceId" TEXT,
    "userRole" TEXT,
    "module" TEXT,
    "page" TEXT,
    "appVersion" TEXT,
    "browser" TEXT,
    "traceId" TEXT NOT NULL,
    "errorCode" TEXT,
    "properties" JSONB,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageEvent_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UsageEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "DisplayDevice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "clientType" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "module" TEXT,
    "page" TEXT,
    "appVersion" TEXT,
    "browser" TEXT,
    "traceId" TEXT NOT NULL,
    "processingNote" TEXT,
    "processedById" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Feedback_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Feedback_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Feedback_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Feedback_code_key" ON "Feedback"("code");
CREATE INDEX "UsageEvent_classId_occurredAt_idx" ON "UsageEvent"("classId", "occurredAt");
CREATE INDEX "UsageEvent_userId_occurredAt_idx" ON "UsageEvent"("userId", "occurredAt");
CREATE INDEX "UsageEvent_deviceId_occurredAt_idx" ON "UsageEvent"("deviceId", "occurredAt");
CREATE INDEX "UsageEvent_eventName_occurredAt_idx" ON "UsageEvent"("eventName", "occurredAt");
CREATE INDEX "UsageEvent_traceId_idx" ON "UsageEvent"("traceId");
CREATE INDEX "Feedback_classId_createdAt_idx" ON "Feedback"("classId", "createdAt");
CREATE INDEX "Feedback_classId_status_createdAt_idx" ON "Feedback"("classId", "status", "createdAt");
CREATE INDEX "Feedback_submittedById_createdAt_idx" ON "Feedback"("submittedById", "createdAt");
CREATE INDEX "Feedback_traceId_idx" ON "Feedback"("traceId");
