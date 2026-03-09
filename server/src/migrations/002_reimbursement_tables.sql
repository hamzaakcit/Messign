-- Reimbursement base tables: expense_categories, reimbursement_settings, reimbursement_requests.
-- Required by add_budgets_and_ai_fields and fix_all_missing. Idempotent.

CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    spending_limit DECIMAL(12,2),
    requires_justification_above DECIMAL(12,2),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

CREATE TABLE IF NOT EXISTS reimbursement_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    mileage_rate_per_km DECIMAL(8,4) NOT NULL DEFAULT 0.67,
    mileage_currency CHAR(3) NOT NULL DEFAULT 'USD',
    meal_limit DECIMAL(12,2),
    daily_limit DECIMAL(12,2),
    monthly_limit DECIMAL(12,2),
    require_signed_invoice_above DECIMAL(12,2),
    auto_approve_below DECIMAL(12,2),
    enable_ocr BOOLEAN NOT NULL DEFAULT TRUE,
    enable_mileage BOOLEAN NOT NULL DEFAULT TRUE,
    enable_currency_conversion BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reimbursement_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category_id UUID NOT NULL REFERENCES expense_categories(id),
    original_amount DECIMAL(12,2) NOT NULL,
    original_currency CHAR(3) NOT NULL,
    exchange_rate DECIMAL(18,8),
    converted_amount DECIMAL(12,2),
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    expense_date DATE NOT NULL,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_org ON reimbursement_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_submitted_by ON reimbursement_requests(submitted_by);
CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_status ON reimbursement_requests(status);
CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_expense_date ON reimbursement_requests(expense_date DESC);
