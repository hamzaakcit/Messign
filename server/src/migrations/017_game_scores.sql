-- Dora Dash mini-game leaderboard
CREATE TABLE IF NOT EXISTS game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_scores_top ON game_scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_user ON game_scores (user_id);
