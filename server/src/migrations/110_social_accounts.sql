-- Migration 110: social_accounts table for OAuth token storage per organization
-- Stores long-lived access tokens for social platforms (Instagram, LinkedIn, X, etc.)

CREATE TABLE IF NOT EXISTS social_accounts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL,
  platform          VARCHAR(32) NOT NULL CHECK (platform IN ('instagram', 'linkedin', 'x', 'facebook')),
  platform_user_id  TEXT        NOT NULL,   -- IG user ID or FB page ID
  platform_username TEXT,                   -- @handle for display
  display_name      TEXT,                   -- "Acme Corp" for display
  avatar_url        TEXT,
  access_token      TEXT        NOT NULL,   -- long-lived access token (60d for IG)
  token_expires_at  TIMESTAMPTZ,            -- NULL = never (page tokens)
  scopes            TEXT[],                 -- granted OAuth scopes
  meta              JSONB       NOT NULL DEFAULT '{}',  -- platform-specific extras
  connected_by      UUID,                   -- user who connected the account
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at      TIMESTAMPTZ,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, platform, platform_user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_org_platform
  ON social_accounts (organization_id, platform)
  WHERE is_active = TRUE;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_social_accounts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_accounts_updated_at ON social_accounts;
CREATE TRIGGER trg_social_accounts_updated_at
  BEFORE UPDATE ON social_accounts
  FOR EACH ROW EXECUTE FUNCTION update_social_accounts_updated_at();
