-- One Instagram professional account per organization. The token is encrypted by the app.
CREATE TABLE IF NOT EXISTS marketing_instagram_connections (
  organization_id UUID PRIMARY KEY,
  account_id TEXT NOT NULL,
  username TEXT,
  access_token_enc TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE marketing_instagram_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_instagram_connections_org_isolation ON marketing_instagram_connections;
CREATE POLICY marketing_instagram_connections_org_isolation ON marketing_instagram_connections
  USING (organization_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_tenant', true)::uuid);
