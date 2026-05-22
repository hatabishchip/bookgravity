-- CreateTable
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioId" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "clientName" TEXT,
    "assignedTrainerId" TEXT,
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" DATETIME,
    "unreadAdmin" INTEGER NOT NULL DEFAULT 0,
    "unreadTrainer" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsAppConversation_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WhatsAppConversation_assignedTrainerId_fkey" FOREIGN KEY ("assignedTrainerId") REFERENCES "Trainer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "mediaUrl" TEXT,
    "mediaMime" TEXT,
    "templateName" TEXT,
    "waMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorDetail" TEXT,
    "fromTrainerId" TEXT,
    "importedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WhatsAppMessage_fromTrainerId_fkey" FOREIGN KEY ("fromTrainerId") REFERENCES "Trainer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WhatsAppConversation_studioId_lastMessageAt_idx" ON "WhatsAppConversation"("studioId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_assignedTrainerId_idx" ON "WhatsAppConversation"("assignedTrainerId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConversation_studioId_clientPhone_key" ON "WhatsAppConversation"("studioId", "clientPhone");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_waMessageId_key" ON "WhatsAppMessage"("waMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_conversationId_createdAt_idx" ON "WhatsAppMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_waMessageId_idx" ON "WhatsAppMessage"("waMessageId");
