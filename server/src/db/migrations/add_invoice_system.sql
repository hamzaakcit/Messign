-- Invoice System Migration
-- Adds: bank_details, signatures, exchange_rates, invoices, invoice_line_items
-- Alters: reimbursement_users (add base_retainer)

-- 1. Bank Details (one-to-one with reimbursement_users, admin-only editable)
CREATE TABLE IF NOT EXISTS bank_details (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID UNIQUE NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
    bank_name   VARCHAR(255),
    iban        VARCHAR(64),
    swift_bic   VARCHAR(16),
    account_holder VARCHAR(255),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_by  UUID REFERENCES reimbursement_users(id)
);

-- 2. Digital Signatures (base64 PNG from canvas)
CREATE TABLE IF NOT EXISTS signatures (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID UNIQUE NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
    signature_data  TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_by      UUID REFERENCES reimbursement_users(id)
);

-- 3. Exchange Rate Cache (for Frankfurter API results)
CREATE TABLE IF NOT EXISTS exchange_rates (
    id          SERIAL PRIMARY KEY,
    base        VARCHAR(3) NOT NULL DEFAULT 'EUR',
    currency    VARCHAR(3) NOT NULL,
    rate        NUMERIC(12,6) NOT NULL,
    rate_date   DATE NOT NULL,
    fetched_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(currency, rate_date)
);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup ON exchange_rates(currency, rate_date);

-- 4. Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number  VARCHAR(20) UNIQUE NOT NULL,
    employee_id     UUID NOT NULL REFERENCES reimbursement_users(id),
    period_year     INT NOT NULL,
    period_month    INT NOT NULL,
    base_retainer   NUMERIC(12,2) NOT NULL,
    total_expenses  NUMERIC(12,2) NOT NULL DEFAULT 0,
    grand_total     NUMERIC(12,2) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
    generated_date  DATE NOT NULL,
    due_date        DATE NOT NULL,
    pdf_url         TEXT,
    rejection_note  TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, period_year, period_month)
);
CREATE INDEX IF NOT EXISTS idx_invoices_employee ON invoices(employee_id);
CREATE INDEX IF NOT EXISTS idx_invoices_period ON invoices(period_year, period_month);

-- 5. Invoice Line Items
CREATE TABLE IF NOT EXISTS invoice_line_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    expense_id        UUID REFERENCES reimbursement_requests(id),
    description       TEXT NOT NULL,
    amount_eur        NUMERIC(12,2) NOT NULL,
    original_amount   NUMERIC(12,2),
    original_currency VARCHAR(3),
    sort_order        INT NOT NULL DEFAULT 0
);

-- 6. Add base_retainer to reimbursement_users (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'reimbursement_users' AND column_name = 'base_retainer'
    ) THEN
        ALTER TABLE reimbursement_users ADD COLUMN base_retainer NUMERIC(12,2) DEFAULT 5000;
    END IF;
END $$;
