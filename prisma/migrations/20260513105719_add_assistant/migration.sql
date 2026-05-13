-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimeSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "trainerId" TEXT,
    "assistantId" TEXT,
    "maxCapacity" INTEGER NOT NULL DEFAULT 6,
    "price" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeSlot_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimeSlot_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Trainer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TimeSlot" ("createdAt", "date", "endTime", "id", "maxCapacity", "price", "startTime", "trainerId", "updatedAt") SELECT "createdAt", "date", "endTime", "id", "maxCapacity", "price", "startTime", "trainerId", "updatedAt" FROM "TimeSlot";
DROP TABLE "TimeSlot";
ALTER TABLE "new_TimeSlot" RENAME TO "TimeSlot";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
