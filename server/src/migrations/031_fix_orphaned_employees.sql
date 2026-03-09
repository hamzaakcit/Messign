-- Fix employees that "disappeared" due to orphaned organization_id
-- 1. Ensure messign organization exists (fixes "Organization not found" on initAuth)
-- 2. Reassign reimbursement_users with NULL or invalid organization_id to messign org

INSERT INTO organizations (id, name, slug, base_currency)
VALUES ('00000000-0000-0000-0000-000000000001', 'Messign', 'messign', 'USD')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

DO $$
DECLARE
  messign_org_id UUID;
  updated_count INT;
BEGIN
  SELECT id INTO messign_org_id FROM organizations WHERE slug = 'messign' LIMIT 1;
  IF messign_org_id IS NULL THEN
    RAISE NOTICE 'Organization messign not found; skipping orphan fix';
    RETURN;
  END IF;

  UPDATE reimbursement_users ru
  SET organization_id = messign_org_id
  WHERE ru.organization_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = ru.organization_id);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count > 0 THEN
    RAISE NOTICE 'Fixed % orphaned reimbursement_users rows', updated_count;
  END IF;
END $$;
