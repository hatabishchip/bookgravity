-- Ingest path of a bank payment: "sms" (Android forwarder) or "wa" (WhatsApp webhook).
ALTER TABLE "BankPayment" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'sms';
