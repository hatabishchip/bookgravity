-- Day-before class reminder: track when the reminder was sent so the daily
-- cron never double-sends.
ALTER TABLE "Booking" ADD COLUMN "reminderSentAt" DATETIME;
