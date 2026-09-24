-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "dormitoryId" TEXT;

-- AlterTable
ALTER TABLE "SeatLayoutVersion" ADD COLUMN     "rotationWeekKey" VARCHAR(10);

-- AlterTable
ALTER TABLE "ScoreEvent" ADD COLUMN     "sourceDormitoryId" VARCHAR(191),
ADD COLUMN     "sourceDormitoryName" VARCHAR(100);

-- CreateTable
CREATE TABLE "Dormitory" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Dormitory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dormitory_classId_idx" ON "Dormitory"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "Dormitory_classId_name_key" ON "Dormitory"("classId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Dormitory_classId_id_key" ON "Dormitory"("classId", "id");

-- CreateIndex
CREATE INDEX "Student_dormitoryId_idx" ON "Student"("dormitoryId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatLayoutVersion_classId_rotationWeekKey_key" ON "SeatLayoutVersion"("classId", "rotationWeekKey");

-- CreateIndex
CREATE INDEX "ScoreEvent_classId_sourceDormitoryId_occurredAt_idx" ON "ScoreEvent"("classId", "sourceDormitoryId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_classId_dormitoryId_fkey" FOREIGN KEY ("classId", "dormitoryId") REFERENCES "Dormitory"("classId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dormitory" ADD CONSTRAINT "Dormitory_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
