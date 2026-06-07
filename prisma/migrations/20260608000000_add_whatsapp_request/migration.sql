-- WhatsApp activation request workflow: admin submits Phone Number ID +
-- display phone via /admin/settings, super-admin approves via /sadmin.
-- All columns nullable; default state is "no request".
ALTER TABLE "Studio" ADD COLUMN "whatsappRequestPhoneNumberId" TEXT;
ALTER TABLE "Studio" ADD COLUMN "whatsappRequestDisplayPhone" TEXT;
ALTER TABLE "Studio" ADD COLUMN "whatsappRequestStatus" TEXT;
ALTER TABLE "Studio" ADD COLUMN "whatsappRequestedAt" DATETIME;
ALTER TABLE "Studio" ADD COLUMN "whatsappRequestReviewedAt" DATETIME;
ALTER TABLE "Studio" ADD COLUMN "whatsappRequestNote" TEXT;
