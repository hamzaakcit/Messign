-- Align finance_notifications with multi-tenant pattern (seed + runtime inserts use tenant_id).
-- Safe on DBs that already have the column.

ALTER TABLE finance_notifications
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE finance_notifications
SET tenant_id = organization_id
WHERE tenant_id IS NULL;

ALTER TABLE finance_notifications
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fin_notif_tenant ON finance_notifications (tenant_id);
