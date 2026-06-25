ALTER TABLE "bold_scorer_bets"
ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);

ALTER TABLE "octopus_goalkeeper_bets"
ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
