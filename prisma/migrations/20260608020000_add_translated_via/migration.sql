-- Track which engine produced each translation (gem/gro/cla/dpl/goo) so the
-- inbox can show a provider label and we can audit quality.
ALTER TABLE "WhatsAppMessage" ADD COLUMN "translatedVia" TEXT;
