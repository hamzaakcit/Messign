-- Migration: 065_add_pto_time_category.sql
-- Adds PTO/Leave time category for cross-module "deals at risk due to PTO" queries.
-- time_entries with this category are used to detect upcoming PTO.
--
-- Fresh DBs: 049_time_tracking creates time_categories without tenant_id; align before seed.

ALTER TABLE time_categories
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE time_categories
SET tenant_id = organization_id
WHERE tenant_id IS NULL;

INSERT INTO time_categories (organization_id, tenant_id, name, description, is_billable_default, color)
SELECT
  o.id,
  o.id,
  'PTO',
  'Paid time off, vacation, leave',
  false,
  '#94A3B8'
FROM organizations o
ON CONFLICT (organization_id, name) DO NOTHING;
