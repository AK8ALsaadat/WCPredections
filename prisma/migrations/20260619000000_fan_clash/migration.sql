CREATE TABLE IF NOT EXISTS "fan_clash_picks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "powerup_starts_at" TIMESTAMP(3),
    "powerup_ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fan_clash_picks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fan_clash_picks_user_id_match_id_player_id_key"
  ON "fan_clash_picks"("user_id", "match_id", "player_id");
CREATE INDEX IF NOT EXISTS "fan_clash_picks_match_id_idx" ON "fan_clash_picks"("match_id");
CREATE INDEX IF NOT EXISTS "fan_clash_picks_user_id_idx" ON "fan_clash_picks"("user_id");

DO $$ BEGIN
    ALTER TABLE "fan_clash_picks" ADD CONSTRAINT "fan_clash_picks_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "fan_clash_picks" ADD CONSTRAINT "fan_clash_picks_match_id_fkey"
      FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "fan_clash_picks" ADD CONSTRAINT "fan_clash_picks_player_id_fkey"
      FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
