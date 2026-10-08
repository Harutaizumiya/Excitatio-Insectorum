ALTER TABLE "TeacherInvitation" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'WEB_ACTIVATION';

CREATE TABLE "WechatTeacherIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WechatTeacherIdentity_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "WechatBindingTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketHash" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "WechatTeacherIdentity_appId_openId_key" ON "WechatTeacherIdentity"("appId", "openId");
CREATE UNIQUE INDEX "WechatTeacherIdentity_appId_userId_key" ON "WechatTeacherIdentity"("appId", "userId");
CREATE INDEX "WechatTeacherIdentity_userId_idx" ON "WechatTeacherIdentity"("userId");
CREATE UNIQUE INDEX "WechatBindingTicket_ticketHash_key" ON "WechatBindingTicket"("ticketHash");
CREATE INDEX "WechatBindingTicket_expiresAt_idx" ON "WechatBindingTicket"("expiresAt");
