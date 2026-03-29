-- Avatar URL for leaderboard / chat display (optional; null when unset).
-- Idempotent: safe on fresh and existing databases.

ALTER TABLE reimbursement_users ADD COLUMN IF NOT EXISTS avatar TEXT;
