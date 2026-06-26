CREATE TABLE IF NOT EXISTS "knockout_bracket_predictions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "finalist_one_team_id" TEXT NOT NULL,
  "finalist_two_team_id" TEXT NOT NULL,
  "champion_team_id" TEXT NOT NULL,
  "finalist_one_points" INTEGER NOT NULL DEFAULT 0,
  "finalist_two_points" INTEGER NOT NULL DEFAULT 0,
  "champion_points" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "knockout_bracket_predictions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "knockout_bracket_predictions_user_id_key"
  ON "knockout_bracket_predictions"("user_id");

CREATE INDEX IF NOT EXISTS "knockout_bracket_predictions_champion_team_id_idx"
  ON "knockout_bracket_predictions"("champion_team_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knockout_bracket_predictions_user_id_fkey'
  ) THEN
    ALTER TABLE "knockout_bracket_predictions"
      ADD CONSTRAINT "knockout_bracket_predictions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knockout_bracket_predictions_finalist_one_team_id_fkey'
  ) THEN
    ALTER TABLE "knockout_bracket_predictions"
      ADD CONSTRAINT "knockout_bracket_predictions_finalist_one_team_id_fkey"
      FOREIGN KEY ("finalist_one_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knockout_bracket_predictions_finalist_two_team_id_fkey'
  ) THEN
    ALTER TABLE "knockout_bracket_predictions"
      ADD CONSTRAINT "knockout_bracket_predictions_finalist_two_team_id_fkey"
      FOREIGN KEY ("finalist_two_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knockout_bracket_predictions_champion_team_id_fkey'
  ) THEN
    ALTER TABLE "knockout_bracket_predictions"
      ADD CONSTRAINT "knockout_bracket_predictions_champion_team_id_fkey"
      FOREIGN KEY ("champion_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
