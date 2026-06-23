-- Recommended DB indexes to speed up leaderboard queries
-- Run these on your PostgreSQL database (as a DBA or via your migration tool)

-- Index on match time for fast range queries
CREATE INDEX IF NOT EXISTS idx_matches_match_time ON matches (match_time);

-- Indexes for prediction-like tables used in leaderboard aggregations
CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions (match_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON predictions (user_id);
CREATE INDEX IF NOT EXISTS idx_scorer_predictions_match_id ON scorer_predictions (match_id);
CREATE INDEX IF NOT EXISTS idx_bold_scorer_bets_match_id ON bold_scorer_bets (match_id);
CREATE INDEX IF NOT EXISTS idx_octopus_goalkeeper_bets_match_id ON octopus_goalkeeper_bets (match_id);

-- Consider composite indexes if queries filter by match_time + user_id frequently
-- CREATE INDEX IF NOT EXISTS idx_predictions_userid_matchtime ON predictions (user_id, match_id);
