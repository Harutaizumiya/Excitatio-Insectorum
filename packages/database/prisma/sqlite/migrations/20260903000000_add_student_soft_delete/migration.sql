ALTER TABLE "Student" ADD COLUMN "deletedAt" DATETIME;

CREATE INDEX "Student_classId_deletedAt_status_idx"
  ON "Student"("classId", "deletedAt", "status");
