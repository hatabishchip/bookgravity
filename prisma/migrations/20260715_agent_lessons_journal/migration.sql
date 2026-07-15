-- Agent autopilot (owner 15.07): RU journal fields + self-learning lessons.
ALTER TABLE "AgentSuggestion" ADD COLUMN "questionRu" TEXT;
ALTER TABLE "AgentSuggestion" ADD COLUMN "answerRu" TEXT;
ALTER TABLE "AgentSuggestion" ADD COLUMN "learnedAt" DATETIME;
CREATE TABLE "AgentLesson" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL,
  "lesson" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "suggestionId" TEXT
);
CREATE INDEX "AgentLesson_active_createdAt_idx" ON "AgentLesson"("active", "createdAt");
