-- Inverted-positions clearance (Sveta 16.07): trainer flag + service gate flag.
ALTER TABLE "Trainer" ADD COLUMN "permInvertedPositions" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AdditionalService" ADD COLUMN "requiresInversionClearance" BOOLEAN NOT NULL DEFAULT false;
