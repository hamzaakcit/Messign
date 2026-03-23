-- ============================================================================
-- Railway / hosted Postgres — schema public permission repair
-- ============================================================================
-- Run as a superuser when you see "permission denied for schema public" or
-- objects owned by a role other than your app connection.
-- Review in staging first; reassigning ownership can affect backups and roles.
-- ============================================================================

-- Reassign table ownership in public to postgres (adjust role name if needed)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO postgres', r.tablename);
  END LOOP;
END $$;

GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres;
