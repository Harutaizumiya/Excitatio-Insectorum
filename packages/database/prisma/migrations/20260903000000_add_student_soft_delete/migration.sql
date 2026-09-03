ALTER TABLE "Student" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

CREATE INDEX "Student_classId_deletedAt_status_idx"
  ON "Student"("classId", "deletedAt", "status");
