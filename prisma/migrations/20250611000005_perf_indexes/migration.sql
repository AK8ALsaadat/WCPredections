CREATE INDEX IF NOT EXISTS "matches_round_id_idx" ON "matches"("round_id");
CREATE INDEX IF NOT EXISTS "matches_status_match_time_idx" ON "matches"("status", "match_time");
CREATE INDEX IF NOT EXISTS "predictions_user_id_idx" ON "predictions"("user_id");
CREATE INDEX IF NOT EXISTS "predictions_match_id_idx" ON "predictions"("match_id");
CREATE INDEX IF NOT EXISTS "scorer_predictions_user_id_idx" ON "scorer_predictions"("user_id");
CREATE INDEX IF NOT EXISTS "scorer_predictions_match_id_idx" ON "scorer_predictions"("match_id");
