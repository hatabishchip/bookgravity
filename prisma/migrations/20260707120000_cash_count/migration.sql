-- Physical cash-drawer recounts (Sveta's control function). Each row is a
-- reconciliation: what was expected vs what was counted, difference logged.
CREATE TABLE IF NOT EXISTS "CashCount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioId" TEXT NOT NULL,
    "counted" REAL NOT NULL,
    "expected" REAL NOT NULL,
    "difference" REAL NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashCount_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CashCount_studioId_createdAt_idx" ON "CashCount"("studioId", "createdAt");
