-- Add updated_at to performance_teams so admin departments PUT/DELETE work
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'performance_teams' AND column_name = 'updated_at') THEN
    ALTER TABLE performance_teams ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
