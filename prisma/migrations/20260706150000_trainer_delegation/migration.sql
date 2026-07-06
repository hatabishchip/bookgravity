-- Delegated trainer rights (per-trainer toggles the studio admin flips) +
-- "phone unverified" marker for client bookings whose WhatsApp code failed
-- to deliver. All additive, safe on live data.
ALTER TABLE "Trainer" ADD COLUMN "permBookAnyClass" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Trainer" ADD COLUMN "permManageBookings" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Booking" ADD COLUMN "phoneUnverified" BOOLEAN NOT NULL DEFAULT false;
