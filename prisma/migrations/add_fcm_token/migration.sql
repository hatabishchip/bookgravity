-- Native FCM registration token (Android) for collapsed chat notifications.
-- Applied manually to the Turso prod DB on 2026-06-24 (no migrate-deploy in
-- the build pipeline; matches the hand-made add_booking_preview migration).
ALTER TABLE "NativePushToken" ADD COLUMN "fcmToken" TEXT;
