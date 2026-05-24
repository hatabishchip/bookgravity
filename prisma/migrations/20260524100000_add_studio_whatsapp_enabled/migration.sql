-- Add whatsappEnabled flag to Studio so the WhatsApp inbox feature can be
-- toggled per-studio by a (future) super-admin UI. Defaults to false so new
-- studios are opted out; existing studios should be migrated case-by-case.
ALTER TABLE "Studio" ADD COLUMN "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false;
