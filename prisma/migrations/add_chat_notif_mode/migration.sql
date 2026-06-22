-- Add chatNotifMode to User: controls sound/vibration for chat push notifications
-- Values: SOUND_VIBRATION (default) | VIBRATION_ONLY | SOUND_ONLY
ALTER TABLE "User" ADD COLUMN "chatNotifMode" TEXT NOT NULL DEFAULT 'SOUND_VIBRATION';
