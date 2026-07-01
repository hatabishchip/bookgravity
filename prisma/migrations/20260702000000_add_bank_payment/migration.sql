-- Bank payment confirmations parsed from forwarded BRI QRIS SMS.
CREATE TABLE "BankPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'QRIS',
    "sender" TEXT,
    "rawText" TEXT NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "bookingId" TEXT,
    "matchedByUserId" TEXT,
    "matchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankPayment_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BankPayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BankPayment_studioId_reference_key" ON "BankPayment"("studioId", "reference");
CREATE INDEX "BankPayment_studioId_paidAt_idx" ON "BankPayment"("studioId", "paidAt");
CREATE INDEX "BankPayment_bookingId_idx" ON "BankPayment"("bookingId");
