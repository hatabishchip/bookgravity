-- Diagnostic fields so we can audit why a booking's trainer notification
-- didn't reach WhatsApp. Status values: sent / failed / skipped / not_sent.
ALTER TABLE "Booking" ADD COLUMN "waNotifyTrainerStatus" TEXT DEFAULT 'not_sent';
ALTER TABLE "Booking" ADD COLUMN "waNotifyTrainerError" TEXT;
ALTER TABLE "Booking" ADD COLUMN "waNotifyTrainerMessageId" TEXT;
