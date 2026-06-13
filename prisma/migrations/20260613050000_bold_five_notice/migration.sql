ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "has_seen_bold_five_notice" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "bold_scorer_bets"
ADD COLUMN IF NOT EXISTS "usage_round_key" TEXT;

UPDATE "bold_scorer_bets"
SET "usage_round_key" = "round_id" || ':legacy'
WHERE "usage_round_key" IS NULL;

ALTER TABLE "bold_scorer_bets"
ALTER COLUMN "usage_round_key" SET NOT NULL;

DROP INDEX IF EXISTS "bold_scorer_bets_user_id_round_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "bold_scorer_bets_user_id_usage_round_key_key"
ON "bold_scorer_bets"("user_id", "usage_round_key");
