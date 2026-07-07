-- Payment method on expenses and trainer payouts, so the Cash Flow "cash on
-- hand" can subtract only CASH money-out from CASH money-in (Sveta 06.07).
ALTER TABLE "Expense" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'CASH';
ALTER TABLE "TrainerPayment" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'CASH';
