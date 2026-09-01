-- Create class schedules and switchable time templates.
CREATE TABLE "ScheduleTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleTemplate_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "Classroom" ADD COLUMN "activeScheduleTemplateId" TEXT REFERENCES "ScheduleTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ScheduleTemplatePeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    CONSTRAINT "ScheduleTemplatePeriod_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScheduleTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ScheduleEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "courseName" TEXT NOT NULL,
    "classTeacherId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleEntry_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduleEntry_classTeacherId_fkey" FOREIGN KEY ("classTeacherId") REFERENCES "ClassTeacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Classroom_activeScheduleTemplateId_key" ON "Classroom"("activeScheduleTemplateId");
CREATE UNIQUE INDEX "ScheduleTemplate_classId_name_key" ON "ScheduleTemplate"("classId", "name");
CREATE INDEX "ScheduleTemplate_classId_updatedAt_idx" ON "ScheduleTemplate"("classId", "updatedAt");
CREATE UNIQUE INDEX "ScheduleTemplatePeriod_templateId_periodNo_key" ON "ScheduleTemplatePeriod"("templateId", "periodNo");
CREATE INDEX "ScheduleTemplatePeriod_templateId_periodNo_idx" ON "ScheduleTemplatePeriod"("templateId", "periodNo");
CREATE UNIQUE INDEX "ScheduleEntry_classId_weekday_periodNo_key" ON "ScheduleEntry"("classId", "weekday", "periodNo");
CREATE INDEX "ScheduleEntry_classId_weekday_periodNo_idx" ON "ScheduleEntry"("classId", "weekday", "periodNo");
CREATE INDEX "ScheduleEntry_classTeacherId_idx" ON "ScheduleEntry"("classTeacherId");
