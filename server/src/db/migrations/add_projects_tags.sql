-- Add tags column to projects for Skill Tags (e.g. #React, #Marketing)
-- Type: TEXT[] (array of text), Default: '{}' (empty array)
-- Safe to run multiple times (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'tags'
  ) THEN
    ALTER TABLE projects ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
  END IF;
END $$;
