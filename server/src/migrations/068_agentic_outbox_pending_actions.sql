-- Agentic layer: pending_actions org + idempotency, HITL idempotency store, RAG outbox

ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_idem_pending
  ON pending_actions (organization_id, user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status = 'pending';

CREATE TABLE IF NOT EXISTS ai_hitl_idempotency (
  organization_id UUID NOT NULL,
  auth_user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  message TEXT NOT NULL,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, auth_user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS rag_outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_rag_outbox_pending ON rag_outbox_events (created_at) WHERE processed_at IS NULL;
