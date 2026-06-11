CREATE TABLE IF NOT EXISTS "bold_scorer_bets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bold_scorer_bets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bold_scorer_bets_user_id_round_id_key"
  ON "bold_scorer_bets"("user_id", "round_id");
CREATE INDEX IF NOT EXISTS "bold_scorer_bets_match_id_idx" ON "bold_scorer_bets"("match_id");
CREATE INDEX IF NOT EXISTS "bold_scorer_bets_user_id_idx" ON "bold_scorer_bets"("user_id");

DO $$ BEGIN
    ALTER TABLE "bold_scorer_bets" ADD CONSTRAINT "bold_scorer_bets_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "bold_scorer_bets" ADD CONSTRAINT "bold_scorer_bets_round_id_fkey"
      FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "bold_scorer_bets" ADD CONSTRAINT "bold_scorer_bets_match_id_fkey"
      FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "bold_scorer_bets" ADD CONSTRAINT "bold_scorer_bets_player_id_fkey"
      FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
