ALTER TABLE "knockout_bracket_predictions"
  ADD COLUMN IF NOT EXISTS "picks" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "knockout_bracket_predictions"
  ADD COLUMN IF NOT EXISTS "total_points" INTEGER NOT NULL DEFAULT 0;

UPDATE "knockout_bracket_predictions"
SET "total_points" =
  COALESCE("finalist_one_points", 0) +
  COALESCE("finalist_two_points", 0) +
  COALESCE("champion_points", 0);
