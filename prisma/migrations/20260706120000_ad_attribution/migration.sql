-- CTWA (Click-to-WhatsApp) ad attribution on WhatsAppConversation. Additive,
-- nullable - safe on a live table (no data rewrite, no locks of note).
ALTER TABLE "WhatsAppConversation" ADD COLUMN "adSourceType" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "adSourceId" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "adCtwaClid" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "adHeadline" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "adSourceUrl" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "adReferralAt" DATETIME;
CREATE INDEX "WhatsAppConversation_adSourceId_idx" ON "WhatsAppConversation"("adSourceId");
CREATE INDEX "WhatsAppConversation_adReferralAt_idx" ON "WhatsAppConversation"("adReferralAt");
