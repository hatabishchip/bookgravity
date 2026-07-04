-- Class-level cancellation (trainer "can't teach") + cancellation attribution.
-- TimeSlot: cancelledAt is the single source of truth (null = active). A slot
-- with bookings is never hard-deleted anymore - it becomes a tombstone.
ALTER TABLE "TimeSlot" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "TimeSlot" ADD COLUMN "cancelledByUserId" TEXT;
ALTER TABLE "TimeSlot" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "TimeSlot" ADD COLUMN "movedToSlotId" TEXT;

-- Booking: who cancelled it and when ("client" | "trainer" | "admin" | "system").
ALTER TABLE "Booking" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "Booking" ADD COLUMN "cancelledByUserId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "cancelledByRole" TEXT;
