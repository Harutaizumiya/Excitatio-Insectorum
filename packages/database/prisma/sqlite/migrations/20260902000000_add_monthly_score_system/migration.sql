-- Add monthly score periods, structured events, committee assignments and legacy-compatible score fields.
ALTER TABLE "ScoreRule" ADD COLUMN "systemPolicyKey" TEXT;

CREATE TABLE "ScorePeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "initialScore" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "settledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScorePeriod_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ScoreEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "reason" TEXT,
    "parameters" TEXT,
    "businessKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScoreEvent_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScoreEvent_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ScorePeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScoreEvent_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ScoreEventParticipant" (
    "eventId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    PRIMARY KEY ("eventId", "studentId"),
    CONSTRAINT "ScoreEventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ScoreEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScoreEventParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ClassCommitteeAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "subject" TEXT,
    "termStartAt" DATETIME NOT NULL,
    "termEndAt" DATETIME,
    "trialEndsAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClassCommitteeAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClassCommitteeAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "ScoreRecord" ADD COLUMN "periodId" TEXT;
ALTER TABLE "ScoreRecord" ADD COLUMN "eventId" TEXT;
ALTER TABLE "ScoreRecord" ADD COLUMN "occurredAt" DATETIME;
ALTER TABLE "ScoreRecord" ADD COLUMN "violation" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ScoreRecord" SET "occurredAt" = "createdAt" WHERE "occurredAt" IS NULL;

CREATE UNIQUE INDEX "ScorePeriod_classId_startAt_endAt_key" ON "ScorePeriod"("classId", "startAt", "endAt");
CREATE INDEX "ScorePeriod_classId_startAt_endAt_idx" ON "ScorePeriod"("classId", "startAt", "endAt");
CREATE INDEX "ScorePeriod_classId_status_idx" ON "ScorePeriod"("classId", "status");
CREATE UNIQUE INDEX "ScoreEvent_businessKey_key" ON "ScoreEvent"("businessKey");
CREATE INDEX "ScoreEvent_classId_occurredAt_idx" ON "ScoreEvent"("classId", "occurredAt");
CREATE INDEX "ScoreEvent_periodId_type_idx" ON "ScoreEvent"("periodId", "type");
CREATE INDEX "ScoreEvent_operatorId_occurredAt_idx" ON "ScoreEvent"("operatorId", "occurredAt");
CREATE INDEX "ScoreEventParticipant_studentId_idx" ON "ScoreEventParticipant"("studentId");
CREATE UNIQUE INDEX "ClassCommitteeAssignment_classId_studentId_role_termStartAt_key" ON "ClassCommitteeAssignment"("classId", "studentId", "role", "termStartAt");
CREATE INDEX "ClassCommitteeAssignment_classId_status_termStartAt_termEndAt_idx" ON "ClassCommitteeAssignment"("classId", "status", "termStartAt", "termEndAt");
CREATE INDEX "ClassCommitteeAssignment_studentId_status_idx" ON "ClassCommitteeAssignment"("studentId", "status");
CREATE INDEX "ScoreRecord_periodId_studentId_createdAt_idx" ON "ScoreRecord"("periodId", "studentId", "createdAt");
CREATE INDEX "ScoreRecord_eventId_idx" ON "ScoreRecord"("eventId");
CREATE INDEX "ScoreRule_classId_systemPolicyKey_idx" ON "ScoreRule"("classId", "systemPolicyKey");
