-- Login hot path: org resolution + ensureReimbursementUserForAuth existence checks use auth_user_id.
-- Safe to run multiple times.

CREATE INDEX IF NOT EXISTS idx_reimbursement_users_auth_user_id
  ON reimbursement_users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;
