-- Agent v2: one-shot trainer WhatsApp notification per BOOKING/ESCALATE suggestion.
ALTER TABLE "AgentSuggestion" ADD COLUMN "trainerNotifiedAt" DATETIME;
