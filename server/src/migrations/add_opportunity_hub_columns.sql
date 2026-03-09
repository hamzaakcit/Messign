-- Opportunity Hub: add opportunity_type, is_mspd, reward_currency, estimated_minutes to projects
-- opportunity_type: 'project' (long-term team) or 'side_op' (up to 2 people, quick task)
-- is_mspd: Messign Special Projects Division (premium tier)
-- reward_currency: 'XP' or 'MSP' (MSP when is_mspd is true by default)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'opportunity_type') THEN
    ALTER TABLE projects ADD COLUMN opportunity_type VARCHAR(20) NOT NULL DEFAULT 'project'
      CHECK (opportunity_type IN ('project', 'side_op'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'is_mspd') THEN
    ALTER TABLE projects ADD COLUMN is_mspd BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'reward_currency') THEN
    ALTER TABLE projects ADD COLUMN reward_currency VARCHAR(10) NOT NULL DEFAULT 'XP'
      CHECK (reward_currency IN ('XP', 'MSP'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'estimated_minutes') THEN
    ALTER TABLE projects ADD COLUMN estimated_minutes INT;
  END IF;
END $$;
