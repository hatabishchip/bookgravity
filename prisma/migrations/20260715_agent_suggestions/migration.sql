-- AI sales agent (suggest-mode): suggestions table + agent signature flag.
ALTER TABLE "WhatsAppMessage" ADD COLUMN "fromAgent" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "AgentSuggestion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "inboundMessageId" TEXT,
  "category" TEXT NOT NULL,
  "draft" TEXT,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "sentText" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AgentSuggestion_conversationId_createdAt_idx" ON "AgentSuggestion"("conversationId", "createdAt");
CREATE INDEX "AgentSuggestion_status_createdAt_idx" ON "AgentSuggestion"("status", "createdAt");
