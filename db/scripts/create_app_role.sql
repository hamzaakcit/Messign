-- ═══════════════════════════════════════════════════════════════════════════════
-- Create restricted app role for RLS enforcement
-- ═══════════════════════════════════════════════════════════════════════════════
-- The app's database user must NOT have BYPASSRLS or SUPERUSER. If the current
-- role has these, RLS policies are silently skipped.
--
-- Run this as a superuser (e.g. postgres). Then update DATABASE_URL to use
-- messign_app instead of the superuser.
--
-- Replace 'YOUR_STRONG_PASSWORD' with a strong password.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create the app role (no superuser, no bypassrls)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'messign_app') THEN
    CREATE ROLE messign_app LOGIN PASSWORD 'YOUR_STRONG_PASSWORD';
    RAISE NOTICE 'Created role messign_app';
  ELSE
    RAISE NOTICE 'Role messign_app already exists';
  END IF;
END $$;

-- Ensure NO bypass (critical for RLS)
ALTER ROLE messign_app NOBYPASSRLS;
ALTER ROLE messign_app NOSUPERUSER;

-- Grant schema access
GRANT USAGE ON SCHEMA public TO messign_app;

-- Grant table access
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO messign_app;

-- Grant sequence access (for serials, UUIDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO messign_app;

-- Default privileges for future tables (applies to objects created by the role running this script)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO messign_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO messign_app;

-- Grant execute on tenant functions (required for RLS)
GRANT EXECUTE ON FUNCTION set_app_tenant(uuid) TO messign_app;
GRANT EXECUTE ON FUNCTION current_tenant_id() TO messign_app;

-- Grant execute on all functions (triggers, helpers, etc.)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO messign_app;

-- Verify
SELECT rolname, rolbypassrls, rolsuper
FROM pg_roles
WHERE rolname = 'messign_app';
-- Expected: rolbypassrls=false, rolsuper=false
