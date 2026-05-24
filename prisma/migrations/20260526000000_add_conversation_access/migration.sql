-- Multi-trainer access for WhatsApp conversations.
--
-- Until now WhatsAppConversation.assignedTrainerId was the single source of
-- truth for "which trainer can see this chat in /trainer/inbox". When a
-- client booked first with trainer A and then with trainer B, the chat was
-- reassigned to B and A lost access entirely.
--
-- This migration adds a join table so multiple trainers can co-own a chat:
-- one row per (conversationId, trainerId). The booking flow inserts a row
-- for the slot's trainer on every booking (idempotent via UNIQUE).
--
-- We KEEP assignedTrainerId — it's now just "primary / latest trainer" for
-- the admin list chip & sorting purposes.

CREATE TABLE "WhatsAppConversationAccess" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "conversationId" TEXT NOT NULL,
  "trainerId" TEXT NOT NULL,
  "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppConversationAccess_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WhatsAppConversationAccess_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WhatsAppConversationAccess_conversationId_trainerId_key" ON "WhatsAppConversationAccess"("conversationId", "trainerId");
CREATE INDEX "WhatsAppConversationAccess_trainerId_idx" ON "WhatsAppConversationAccess"("trainerId");

-- Backfill #1: every conversation that already has an assignedTrainerId gets
-- an access row so the current ("last-trainer-only") behavior is preserved.
INSERT INTO "WhatsAppConversationAccess" ("id", "conversationId", "trainerId", "grantedAt")
SELECT lower(hex(randomblob(16))), c."id", c."assignedTrainerId", CURRENT_TIMESTAMP
FROM "WhatsAppConversation" c
WHERE c."assignedTrainerId" IS NOT NULL;

-- Backfill #2: also grant access to every OTHER trainer the client has ever
-- booked with in this studio, so multi-assign starts working retroactively.
-- Booking.clientPhone may have a leading "+" / spaces / dashes; the
-- conversation's clientPhone is digits-only. Compare via LIKE-suffix —
-- digits-only phone is always a suffix of the formatted booking phone.
-- OR IGNORE skips pairs already inserted by step #1.
INSERT OR IGNORE INTO "WhatsAppConversationAccess" ("id", "conversationId", "trainerId", "grantedAt")
SELECT lower(hex(randomblob(16))), c."id", t."trainerId", CURRENT_TIMESTAMP
FROM "WhatsAppConversation" c
INNER JOIN "Booking" b ON b."clientPhone" LIKE ('%' || c."clientPhone") AND b."status" = 'CONFIRMED'
INNER JOIN "TimeSlot" t ON t."id" = b."slotId"
WHERE t."trainerId" IS NOT NULL
  AND t."studioId" = c."studioId";
