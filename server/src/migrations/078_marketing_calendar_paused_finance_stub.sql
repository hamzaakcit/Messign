-- Calendar: allow `paused` when campaign is frozen (no accidental publish)
ALTER TABLE marketing_content_calendar DROP CONSTRAINT IF EXISTS marketing_content_calendar_status_check;

ALTER TABLE marketing_content_calendar
  ADD CONSTRAINT marketing_content_calendar_status_check
  CHECK (status IN ('planned', 'scheduled', 'processing', 'published', 'failed', 'paused'));

COMMENT ON COLUMN marketing_content_calendar.status IS 'scheduled = ready to publish; paused = frozen with campaign; processing/published/failed per publisher';

-- Double-entry journal stub for marketing ↔ finance sync (same transaction as budget allocation)
CREATE TABLE IF NOT EXISTS finance_marketing_journal_stub (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  debit_account TEXT NOT NULL,
  credit_account TEXT NOT NULL,
  description TEXT,
  campaign_id UUID,
  channel VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_mkt_journal_ws ON finance_marketing_journal_stub(workspace_id);
CREATE INDEX IF NOT EXISTS idx_fin_mkt_journal_campaign ON finance_marketing_journal_stub(campaign_id);

COMMENT ON TABLE finance_marketing_journal_stub IS 'Marketing expense journal lines (Debit Marketing Expense / Credit Cash or AP) — transactional with marketing_budget_allocations';
