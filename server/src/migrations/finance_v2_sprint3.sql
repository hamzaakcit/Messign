-- Finance v2 Sprint 3: Accounting Core
-- All statements are idempotent

-- ============================================================
-- 1. Extend finance_gl_accounts
-- ============================================================
ALTER TABLE finance_gl_accounts
  ADD COLUMN IF NOT EXISTS normal_balance VARCHAR(6) CHECK (normal_balance IN ('debit', 'credit')),
  ADD COLUMN IF NOT EXISTS balance DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Back-fill normal_balance based on account type
UPDATE finance_gl_accounts SET normal_balance = 'debit'
WHERE normal_balance IS NULL AND type IN ('asset', 'expense');

UPDATE finance_gl_accounts SET normal_balance = 'credit'
WHERE normal_balance IS NULL AND type IN ('liability', 'revenue', 'equity');

-- ============================================================
-- 2. Journal Entries
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_journal_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  entry_number      VARCHAR(20) NOT NULL,
  entry_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  description       TEXT NOT NULL,
  source_type       VARCHAR(30) NOT NULL CHECK (source_type IN (
    'expense_approved', 'expense_paid', 'invoice_sent', 'invoice_paid',
    'payment_completed', 'manual', 'period_close', 'void_reversal'
  )),
  source_id         UUID,
  status            VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'voided')),
  period            VARCHAR(7) NOT NULL,
  total_debit       DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_credit      DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_auto_generated BOOLEAN DEFAULT FALSE,
  posted_at         TIMESTAMPTZ,
  created_by        UUID REFERENCES reimbursement_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes             TEXT,
  UNIQUE(organization_id, entry_number)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_org ON finance_journal_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_period ON finance_journal_entries(period);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON finance_journal_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON finance_journal_entries(status);

-- ============================================================
-- 3. Journal Lines
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_journal_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id  UUID NOT NULL REFERENCES finance_journal_entries(id) ON DELETE CASCADE,
  gl_account_id     UUID NOT NULL REFERENCES finance_gl_accounts(id),
  debit_amount      DECIMAL(14,2) NOT NULL DEFAULT 0,
  credit_amount     DECIMAL(14,2) NOT NULL DEFAULT 0,
  description       VARCHAR(500),
  sort_order        INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON finance_journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON finance_journal_lines(gl_account_id);

-- ============================================================
-- 4. Tax Rates
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_tax_rates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  name              VARCHAR(100) NOT NULL,
  code              VARCHAR(20) NOT NULL,
  rate              DECIMAL(7,4) NOT NULL,
  type              VARCHAR(20) NOT NULL CHECK (type IN ('sales', 'purchase', 'vat', 'withholding')),
  is_default        BOOLEAN DEFAULT FALSE,
  is_active         BOOLEAN DEFAULT TRUE,
  effective_from    DATE,
  effective_until   DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_org ON finance_tax_rates(organization_id);

-- ============================================================
-- 5. Period Closes
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_period_closes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  period            VARCHAR(7) NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed', 'locked')),
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ,
  closed_by         UUID REFERENCES reimbursement_users(id),
  locked_at         TIMESTAMPTZ,
  locked_by         UUID REFERENCES reimbursement_users(id),
  revenue_total     DECIMAL(14,2),
  expense_total     DECIMAL(14,2),
  net_income        DECIMAL(14,2),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, period)
);

CREATE INDEX IF NOT EXISTS idx_period_closes_org ON finance_period_closes(organization_id);

-- ============================================================
-- 6. Period Close Tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_period_close_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_close_id   UUID NOT NULL REFERENCES finance_period_closes(id) ON DELETE CASCADE,
  task_key          VARCHAR(50) NOT NULL,
  label             VARCHAR(255) NOT NULL,
  is_completed      BOOLEAN DEFAULT FALSE,
  completed_at      TIMESTAMPTZ,
  completed_by      UUID REFERENCES reimbursement_users(id),
  sort_order        INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_period_close_tasks_close ON finance_period_close_tasks(period_close_id);
