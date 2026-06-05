-- Same-day "are you still coming?" reminder (class_today_confirm), sent ~2.5h
-- before the class by the frequent today-reminder cron. Guard against
-- double-sends.
ALTER TABLE "Booking" ADD COLUMN "todayReminderSentAt" DATETIME;

-- Holds the class trainer's WhatsApp number after a today-reminder is sent, so
-- the client's first reply gets forwarded to the trainer. Cleared after the
-- first forward.
ALTER TABLE "WhatsAppConversation" ADD COLUMN "pendingReminderTrainerPhone" TEXT;
