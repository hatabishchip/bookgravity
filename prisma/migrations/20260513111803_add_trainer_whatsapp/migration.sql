-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Trainer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "commissionRate" INTEGER NOT NULL DEFAULT 15,
    "color" TEXT NOT NULL DEFAULT '#6366F1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Trainer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Trainer" ("color", "commissionRate", "createdAt", "id", "name", "updatedAt", "userId") SELECT "color", "commissionRate", "createdAt", "id", "name", "updatedAt", "userId" FROM "Trainer";
DROP TABLE "Trainer";
ALTER TABLE "new_Trainer" RENAME TO "Trainer";
CREATE UNIQUE INDEX "Trainer_userId_key" ON "Trainer"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
