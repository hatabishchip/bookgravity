-- Trainer own-mistake undo window (Seni 10.07): when the payment was recorded.
ALTER TABLE "Booking" ADD COLUMN "paymentMarkedAt" DATETIME;
