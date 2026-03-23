-- ============================================================================
-- Postgres / Supabase: schema + object access (run as superuser)
-- Fixes: permission denied for schema public, MV refresh failures, function exec.
-- Adjust role names to match your project (see `SELECT current_user;` in SQL editor).
--
-- Note: PostgreSQL has no `GRANT ... ON ALL MATERIALIZED VIEWS IN SCHEMA`.
-- `GRANT ALL ON ALL TABLES IN SCHEMA` covers ordinary tables, views, and foreign
-- tables; materialized views are granted explicitly below via pg_matviews.
-- ============================================================================

GRANT ALL ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role;

-- Materialized views (Executive Dashboard / scheduler): explicit per-object GRANT
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, matviewname
    FROM pg_matviews
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'GRANT ALL ON TABLE %I.%I TO postgres, service_role',
      r.schemaname,
      r.matviewname
    );
  END LOOP;
END $$;

-- Future objects created by the role running this script (see Postgres docs for FOR ROLE)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;

-- Optional: mirror default privileges for the API role
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
