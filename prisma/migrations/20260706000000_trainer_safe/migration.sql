-- Trainer cash-safe tracking (optional per studio, off by default).
ALTER TABLE "Studio" ADD COLUMN "safeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Who recorded a booking's payment (whose safe cash lands in).
ALTER TABLE "Booking" ADD COLUMN "paymentMarkedByUserId" TEXT;

-- Manual safe movements (withdrawal / salary payout from safe / correction).
CREATE TABLE IF NOT EXISTS "SafeOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "note" TEXT,
    "paymentId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SafeOperation_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SafeOperation_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SafeOperation_studioId_trainerId_idx" ON "SafeOperation"("studioId", "trainerId");
CREATE INDEX IF NOT EXISTS "SafeOperation_createdAt_idx" ON "SafeOperation"("createdAt");

-- CTWA ad-attribution columns from the parallel session's schema change
-- (additive, applied here so the shared schema.prisma can be committed safely;
-- their webhook code lands separately).
ALTER TABLE "WhatsAppConversation" ADD COLUMN "adSourceType" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "adSourceId" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "adCtwaClid" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "adHeadline" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "adSourceUrl" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "adReferralAt" DATETIME;
CREATE INDEX IF NOT EXISTS "WhatsAppConversation_adSourceId_idx" ON "WhatsAppConversation"("adSourceId");
CREATE INDEX IF NOT EXISTS "WhatsAppConversation_adReferralAt_idx" ON "WhatsAppConversation"("adReferralAt");
