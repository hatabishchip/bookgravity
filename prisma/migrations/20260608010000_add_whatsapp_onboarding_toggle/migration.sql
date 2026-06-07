-- Two new columns powering the self-service WhatsApp activation flow:
--   whatsappOnboardingEnabled — super-admin's per-studio toggle. While
--     false, the activation form in /admin/settings is visible-but-disabled
--     so the studio admin sees what's coming but can't submit yet.
--   whatsappTwoFactorPin — Meta requires a 6-digit PIN at the /register
--     step; we generate one per studio and persist it so re-registers
--     (e.g. token rotations) reuse the same value.
ALTER TABLE "Studio" ADD COLUMN "whatsappOnboardingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Studio" ADD COLUMN "whatsappTwoFactorPin" TEXT;
