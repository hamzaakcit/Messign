-- Migration: 065_add_pto_time_category.sql
-- Adds PTO/Leave time category for cross-module "deals at risk due to PTO" queries.
-- time_entries with this category are used to detect upcoming PTO.
-- RLS: tenant_id required (db/migrations/001_add_tenant_id.sql).

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
