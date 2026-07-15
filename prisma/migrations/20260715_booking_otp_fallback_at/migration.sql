-- AUTH templates deliver only to the primary WhatsApp device; a code stuck in
-- "sent" gets one utility-template fallback. This marks that it fired.
ALTER TABLE "BookingOtp" ADD COLUMN "fallbackAt" DATETIME;
