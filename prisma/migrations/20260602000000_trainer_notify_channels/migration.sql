-- AlterTable
ALTER TABLE "Trainer" ADD COLUMN "notifyEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Trainer" ADD COLUMN "notifyWhatsapp" BOOLEAN NOT NULL DEFAULT false;
