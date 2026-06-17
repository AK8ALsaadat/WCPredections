ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "has_seen_knockout_tutorial" BOOLEAN NOT NULL DEFAULT false;
