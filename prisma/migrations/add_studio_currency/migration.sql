-- Per-studio currency for booking-widget money formatting (USD for USA/Online).
-- Applied manually to Turso prod 2026-06-25 (no migrate-deploy in build).
ALTER TABLE "Studio" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'IDR';
