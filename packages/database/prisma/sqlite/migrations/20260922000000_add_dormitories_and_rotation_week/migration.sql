-- AlterTable
ALTER TABLE "SeatLayoutVersion" ADD COLUMN "rotationWeekKey" TEXT;

-- AlterTable
ALTER TABLE "ScoreEvent" ADD COLUMN "sourceDormitoryId" TEXT;
ALTER TABLE "ScoreEvent" ADD COLUMN "sourceDormitoryName" TEXT;

-- CreateTable
CREATE TABLE "Dormitory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Dormitory_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "studentNo" TEXT,
    "gender" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" DATETIME,
    "dormitoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Student_classId_dormitoryId_fkey" FOREIGN KEY ("classId", "dormitoryId") REFERENCES "Dormitory" ("classId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Student" ("classId", "createdAt", "deletedAt", "gender", "id", "name", "status", "studentNo", "updatedAt") SELECT "classId", "createdAt", "deletedAt", "gender", "id", "name", "status", "studentNo", "updatedAt" FROM "Student";
DROP TABLE "Student";
ALTER TABLE "new_Student" RENAME TO "Student";
CREATE INDEX "Student_classId_status_idx" ON "Student"("classId", "status");
CREATE INDEX "Student_classId_deletedAt_status_idx" ON "Student"("classId", "deletedAt", "status");
CREATE INDEX "Student_dormitoryId_idx" ON "Student"("dormitoryId");
CREATE UNIQUE INDEX "Student_classId_studentNo_key" ON "Student"("classId", "studentNo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Dormitory_classId_idx" ON "Dormitory"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "Dormitory_classId_name_key" ON "Dormitory"("classId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Dormitory_classId_id_key" ON "Dormitory"("classId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SeatLayoutVersion_classId_rotationWeekKey_key" ON "SeatLayoutVersion"("classId", "rotationWeekKey");

-- CreateIndex
CREATE INDEX "ScoreEvent_classId_sourceDormitoryId_occurredAt_idx" ON "ScoreEvent"("classId", "sourceDormitoryId", "occurredAt");
