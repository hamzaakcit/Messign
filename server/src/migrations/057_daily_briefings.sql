CREATE TABLE IF NOT EXISTS daily_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  briefing_date DATE NOT NULL,
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, briefing_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_briefings_user_date
  ON daily_briefings(user_id, briefing_date DESC);
