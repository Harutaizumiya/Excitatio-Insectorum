CREATE TYPE "TeacherInvitationPurpose" AS ENUM ('WEB_ACTIVATION', 'WECHAT_BINDING');

ALTER TABLE "TeacherInvitation"
ADD COLUMN "purpose" "TeacherInvitationPurpose" NOT NULL DEFAULT 'WEB_ACTIVATION';

CREATE TABLE "WechatTeacherIdentity" (
    "id" TEXT NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "openId" VARCHAR(128) NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WechatTeacherIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WechatBindingTicket" (
    "id" TEXT NOT NULL,
    "ticketHash" VARCHAR(64) NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "openId" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WechatBindingTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WechatTeacherIdentity_appId_openId_key" ON "WechatTeacherIdentity"("appId", "openId");
CREATE UNIQUE INDEX "WechatTeacherIdentity_appId_userId_key" ON "WechatTeacherIdentity"("appId", "userId");
CREATE INDEX "WechatTeacherIdentity_userId_idx" ON "WechatTeacherIdentity"("userId");
CREATE UNIQUE INDEX "WechatBindingTicket_ticketHash_key" ON "WechatBindingTicket"("ticketHash");
CREATE INDEX "WechatBindingTicket_expiresAt_idx" ON "WechatBindingTicket"("expiresAt");

ALTER TABLE "WechatTeacherIdentity"
ADD CONSTRAINT "WechatTeacherIdentity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
