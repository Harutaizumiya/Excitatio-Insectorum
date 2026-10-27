CREATE TABLE "ScoreSettlementConfig" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "days" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScoreSettlementConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScoreSettlementConfig_classId_key" ON "ScoreSettlementConfig"("classId");
CREATE INDEX "ScoreSettlementConfig_enabled_idx" ON "ScoreSettlementConfig"("enabled");

ALTER TABLE "ScoreSettlementConfig"
ADD CONSTRAINT "ScoreSettlementConfig_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
