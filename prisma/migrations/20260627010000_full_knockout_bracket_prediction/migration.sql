ALTER TABLE "knockout_bracket_predictions"
  ADD COLUMN IF NOT EXISTS "picks" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "total_points" INTEGER NOT NULL DEFAULT 0;
