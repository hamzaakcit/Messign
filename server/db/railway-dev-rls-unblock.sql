-- ============================================================================
-- DEV / STAGING ONLY — Railway SQL Editor
-- ============================================================================
-- Use when RLS blocks app inserts (e.g. marketing_content) and you need to
-- unblock quickly. NEVER run against production without a security review.
-- Prefer fixing policies + using service_role / BYPASSRLS for automation.
-- ============================================================================

-- Option A — disable RLS on selected tables (reversible with ENABLE ROW LEVEL SECURITY)
-- ALTER TABLE marketing_content DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE reimbursement_users DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE finance_dora_job_runs DISABLE ROW LEVEL SECURITY;

-- Option B — let the database superuser bypass RLS (affects all sessions as postgres)
-- ALTER ROLE postgres WITH BYPASSRLS;
-- To revert: ALTER ROLE postgres WITH NOBYPASSRLS;
