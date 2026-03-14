-- Migration: 067_platform_audit_log.sql
-- SOC 2 Type II audit trail foundation: AI actions, HITL approvals, auth, data writes.

CREATE TABLE IF NOT EXISTS platform_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_date ON platform_audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON platform_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON platform_audit_log (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON platform_audit_log (user_id, created_at DESC);

COMMENT ON TABLE platform_audit_log IS 'SOC 2 audit trail: AI tool execution, HITL approvals, auth events, data writes';

-- RLS: tenant isolation (current_tenant_id from 002_enable_rls / 061)
DO $migrate$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_tenant_id') THEN
    CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $func$
      SELECT NULLIF(current_setting('app.current_tenant', true), '')::UUID;
    $func$ LANGUAGE sql STABLE;
  END IF;
END $migrate$;

ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON platform_audit_log;
CREATE POLICY tenant_isolation ON platform_audit_log FOR ALL USING (tenant_id = current_tenant_id());
