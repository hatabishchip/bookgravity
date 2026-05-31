-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioId" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "clientName" TEXT,
    "totalClasses" INTEGER NOT NULL DEFAULT 5,
    "remainingClasses" INTEGER NOT NULL DEFAULT 5,
    "paymentType" TEXT NOT NULL DEFAULT 'CASH',
    "soldByUserId" TEXT,
    "soldByName" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Membership_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Membership_studioId_clientPhone_idx" ON "Membership"("studioId", "clientPhone");

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "membershipId" TEXT;
