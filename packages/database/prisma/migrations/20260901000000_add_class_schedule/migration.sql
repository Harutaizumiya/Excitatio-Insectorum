-- Create class schedules and switchable time templates.
ALTER TABLE "Classroom" ADD COLUMN "activeScheduleTemplateId" TEXT;

CREATE TABLE "ScheduleTemplate" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScheduleTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleTemplatePeriod" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,

    CONSTRAINT "ScheduleTemplatePeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleEntry" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "courseName" VARCHAR(100) NOT NULL,
    "classTeacherId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScheduleEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Classroom_activeScheduleTemplateId_key"
  ON "Classroom"("activeScheduleTemplateId");
CREATE UNIQUE INDEX "ScheduleTemplate_classId_name_key"
  ON "ScheduleTemplate"("classId", "name");
CREATE INDEX "ScheduleTemplate_classId_updatedAt_idx"
  ON "ScheduleTemplate"("classId", "updatedAt");
CREATE UNIQUE INDEX "ScheduleTemplatePeriod_templateId_periodNo_key"
  ON "ScheduleTemplatePeriod"("templateId", "periodNo");
CREATE INDEX "ScheduleTemplatePeriod_templateId_periodNo_idx"
  ON "ScheduleTemplatePeriod"("templateId", "periodNo");
CREATE UNIQUE INDEX "ScheduleEntry_classId_weekday_periodNo_key"
  ON "ScheduleEntry"("classId", "weekday", "periodNo");
CREATE INDEX "ScheduleEntry_classId_weekday_periodNo_idx"
  ON "ScheduleEntry"("classId", "weekday", "periodNo");
CREATE INDEX "ScheduleEntry_classTeacherId_idx"
  ON "ScheduleEntry"("classTeacherId");

ALTER TABLE "Classroom"
  ADD CONSTRAINT "Classroom_activeScheduleTemplateId_fkey"
  FOREIGN KEY ("activeScheduleTemplateId") REFERENCES "ScheduleTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleTemplate"
  ADD CONSTRAINT "ScheduleTemplate_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "Classroom"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleTemplatePeriod"
  ADD CONSTRAINT "ScheduleTemplatePeriod_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ScheduleTemplate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleEntry"
  ADD CONSTRAINT "ScheduleEntry_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "Classroom"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleEntry"
  ADD CONSTRAINT "ScheduleEntry_classTeacherId_fkey"
  FOREIGN KEY ("classTeacherId") REFERENCES "ClassTeacher"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
