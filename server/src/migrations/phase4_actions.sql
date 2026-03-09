-- Phase 4: Pending Actions table for HITL write action confirmation
-- Run once during deployment.

CREATE TABLE IF NOT EXISTS pending_actions (
  token             UUID PRIMARY KEY,
  action_type       TEXT NOT NULL,
  payload           JSONB NOT NULL,
  description       TEXT NOT NULL,
  display_fields    JSONB NOT NULL DEFAULT '[]',
  editable_fields   TEXT[] NOT NULL DEFAULT '{}',
  user_id           UUID NOT NULL,
  origin_query      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired', 'executed')),
  confirmed_payload JSONB,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at      TIMESTAMPTZ,
  executed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_user ON pending_actions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_expiry ON pending_actions (expires_at) WHERE status = 'pending';
