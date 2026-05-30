-- Super-admin visibility fields
ALTER TABLE "User" ADD COLUMN "initialPassword" TEXT;
ALTER TABLE "Studio" ADD COLUMN "emailsSentCount" INTEGER NOT NULL DEFAULT 0;
