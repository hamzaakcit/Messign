-- Human-in-the-loop approval queue for marketing content (validator telemetry + review actions)

CREATE TABLE IF NOT EXISTS marketing_approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES marketing_content(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  truth_validation JSONB,
  brand_voice_check JSONB,
  compliance_scan JSONB,
  reviewer_feedback TEXT,
  rejection_reason VARCHAR(64),
  reviewed_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_mkt_approval_org_status ON marketing_approval_queue(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_mkt_approval_content ON marketing_approval_queue(content_id);

COMMENT ON TABLE marketing_approval_queue IS 'Pending human review for marketing content with Groq validator JSON payloads';
