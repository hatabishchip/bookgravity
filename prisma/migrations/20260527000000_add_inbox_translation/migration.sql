-- Auto-translation for the WhatsApp inbox.
--
--   Studio.inboxLanguage           — ISO 639-1 of the admin-facing language
--                                    (e.g. "ru"). NULL means translation off.
--   WhatsAppConversation.clientLanguage
--                                  — detected language of the client, used
--                                    as the target when admin replies.
--   WhatsAppMessage.translatedBody — translated text, used for rendering
--                                    bubbles (inbound) or for outbound send
--                                    payload to the client.
--   WhatsAppMessage.detectedLang   — ISO 639-1 of WhatsAppMessage.body.
--
-- All new columns are nullable so existing rows keep working unchanged —
-- translation only kicks in when both inboxLanguage and a client language
-- are present.

ALTER TABLE "Studio" ADD COLUMN "inboxLanguage" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "clientLanguage" TEXT;
ALTER TABLE "WhatsAppMessage" ADD COLUMN "translatedBody" TEXT;
ALTER TABLE "WhatsAppMessage" ADD COLUMN "detectedLang" TEXT;
