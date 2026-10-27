CREATE TABLE "ScoreSettlementConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "dates" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScoreSettlementConfig_classId_fkey"
      FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ScoreSettlementConfig_classId_key" ON "ScoreSettlementConfig"("classId");
CREATE INDEX "ScoreSettlementConfig_enabled_idx" ON "ScoreSettlementConfig"("enabled");
