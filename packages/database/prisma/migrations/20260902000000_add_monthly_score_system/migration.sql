-- Add monthly score periods, structured events, committee assignments and legacy-compatible score fields.
CREATE TYPE "ScorePeriodStatus" AS ENUM ('OPEN', 'SETTLED');
CREATE TYPE "ScoreEventType" AS ENUM (
  'LATE',
  'SCHOOL_UNIFORM',
  'EVENING_SELF_STUDY_CALLOUT',
  'NO_VIOLATION_REWARD',
  'NOISIEST_CLASS_TOP3',
  'HOMEWORK_MISSING',
  'HOMEWORK_PRAISE',
  'EXAM_GRADE_TOP10',
  'SUBJECT_TOP3',
  'BREAKTHROUGH',
  'PROGRESS',
  'DUTY_HYGIENE',
  'DORM_HYGIENE',
  'COMMITTEE_TASK_COMPLETED',
  'COMMITTEE_REWARD',
  'BLACKBOARD',
  'INDIVIDUAL_ACTIVITY',
  'GROUP_ACTIVITY',
  'SPORTS_FINAL_TOP8',
  'ACTIVITY_NEGATIVE',
  'MANUAL'
);

ALTER TABLE "ScoreRule" ADD COLUMN "systemPolicyKey" VARCHAR(100);

CREATE TABLE "ScorePeriod" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "initialScore" INTEGER NOT NULL DEFAULT 100,
    "status" "ScorePeriodStatus" NOT NULL DEFAULT 'OPEN',
    "settledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ScorePeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScoreEvent" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "type" "ScoreEventType" NOT NULL,
    "operatorId" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "parameters" TEXT,
    "businessKey" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScoreEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScoreEventParticipant" (
    "eventId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    CONSTRAINT "ScoreEventParticipant_pkey" PRIMARY KEY ("eventId", "studentId")
);

CREATE TABLE "ClassCommitteeAssignment" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "subject" VARCHAR(100),
    "termStartAt" TIMESTAMPTZ(3) NOT NULL,
    "termEndAt" TIMESTAMPTZ(3),
    "trialEndsAt" TIMESTAMPTZ(3),
    "status" "RelationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ClassCommitteeAssignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ScoreRecord"
  ADD COLUMN "periodId" TEXT,
  ADD COLUMN "eventId" TEXT,
  ADD COLUMN "occurredAt" TIMESTAMPTZ(3),
  ADD COLUMN "violation" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ScoreRecord" SET "occurredAt" = "createdAt" WHERE "occurredAt" IS NULL;

CREATE UNIQUE INDEX "ScorePeriod_classId_startAt_endAt_key"
  ON "ScorePeriod"("classId", "startAt", "endAt");
CREATE INDEX "ScorePeriod_classId_startAt_endAt_idx"
  ON "ScorePeriod"("classId", "startAt", "endAt");
CREATE INDEX "ScorePeriod_classId_status_idx"
  ON "ScorePeriod"("classId", "status");
CREATE UNIQUE INDEX "ScoreEvent_businessKey_key" ON "ScoreEvent"("businessKey");
CREATE INDEX "ScoreEvent_classId_occurredAt_idx" ON "ScoreEvent"("classId", "occurredAt");
CREATE INDEX "ScoreEvent_periodId_type_idx" ON "ScoreEvent"("periodId", "type");
CREATE INDEX "ScoreEvent_operatorId_occurredAt_idx" ON "ScoreEvent"("operatorId", "occurredAt");
CREATE INDEX "ScoreEventParticipant_studentId_idx" ON "ScoreEventParticipant"("studentId");
CREATE UNIQUE INDEX "ClassCommitteeAssignment_classId_studentId_role_termStartAt_key"
  ON "ClassCommitteeAssignment"("classId", "studentId", "role", "termStartAt");
CREATE INDEX "ClassCommitteeAssignment_classId_status_termStartAt_termEndAt_idx"
  ON "ClassCommitteeAssignment"("classId", "status", "termStartAt", "termEndAt");
CREATE INDEX "ClassCommitteeAssignment_studentId_status_idx"
  ON "ClassCommitteeAssignment"("studentId", "status");
CREATE INDEX "ScoreRecord_periodId_studentId_createdAt_idx"
  ON "ScoreRecord"("periodId", "studentId", "createdAt");
CREATE INDEX "ScoreRecord_eventId_idx" ON "ScoreRecord"("eventId");
CREATE INDEX "ScoreRule_classId_systemPolicyKey_idx" ON "ScoreRule"("classId", "systemPolicyKey");

ALTER TABLE "ScorePeriod"
  ADD CONSTRAINT "ScorePeriod_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScoreEvent"
  ADD CONSTRAINT "ScoreEvent_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScoreEvent"
  ADD CONSTRAINT "ScoreEvent_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "ScorePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScoreEvent"
  ADD CONSTRAINT "ScoreEvent_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScoreEventParticipant"
  ADD CONSTRAINT "ScoreEventParticipant_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "ScoreEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScoreEventParticipant"
  ADD CONSTRAINT "ScoreEventParticipant_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassCommitteeAssignment"
  ADD CONSTRAINT "ClassCommitteeAssignment_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassCommitteeAssignment"
  ADD CONSTRAINT "ClassCommitteeAssignment_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScoreRecord"
  ADD CONSTRAINT "ScoreRecord_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "ScorePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScoreRecord"
  ADD CONSTRAINT "ScoreRecord_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "ScoreEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
