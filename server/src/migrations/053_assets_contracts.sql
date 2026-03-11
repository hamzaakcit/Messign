-- ════════════════════════════════════════
-- Asset Management + Contracts & E-Sign
-- ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  depreciation_method VARCHAR(30) DEFAULT 'straight_line' CHECK (depreciation_method IN ('straight_line', 'declining_balance', 'none')),
  useful_life_months INTEGER,
  parent_id UUID REFERENCES asset_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES asset_categories(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  asset_tag VARCHAR(100),
  serial_number VARCHAR(255),
  manufacturer VARCHAR(255),
  model VARCHAR(255),
  status VARCHAR(30) DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'in_maintenance', 'retired', 'lost', 'disposed')),
  condition VARCHAR(20) DEFAULT 'good' CHECK (condition IN ('new', 'good', 'fair', 'poor')),
  purchase_cost DECIMAL(12,2),
  purchase_currency VARCHAR(3) DEFAULT 'EUR',
  purchase_cost_eur DECIMAL(12,2),
  purchase_date DATE,
  current_value DECIMAL(12,2),
  salvage_value DECIMAL(12,2) DEFAULT 0,
  assigned_to UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  department VARCHAR(100),
  location VARCHAR(255),
  warranty_start DATE,
  warranty_end DATE,
  warranty_provider VARCHAR(255),
  warranty_notes TEXT,
  vendor_id UUID REFERENCES finance_vendors(id) ON DELETE SET NULL,
  purchase_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  specifications JSONB DEFAULT '{}'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_assigned ON assets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category_id);
CREATE INDEX IF NOT EXISTS idx_assets_warranty ON assets(warranty_end);
CREATE INDEX IF NOT EXISTS idx_assets_tag ON assets(asset_tag);

CREATE TABLE IF NOT EXISTS asset_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  returned_at TIMESTAMPTZ,
  return_condition VARCHAR(20),
  return_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_asset_assign_asset ON asset_assignments(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_assign_user ON asset_assignments(assigned_to);

CREATE TABLE IF NOT EXISTS asset_maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  type VARCHAR(30) CHECK (type IN ('preventive', 'repair', 'upgrade', 'inspection')),
  description TEXT,
  cost DECIMAL(10,2),
  performed_by VARCHAR(255),
  scheduled_date DATE,
  completed_date DATE,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_maint_asset ON asset_maintenance(asset_id);

CREATE TABLE IF NOT EXISTS licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  software_name VARCHAR(255) NOT NULL,
  vendor VARCHAR(255),
  vendor_id UUID REFERENCES finance_vendors(id) ON DELETE SET NULL,
  license_type VARCHAR(30) DEFAULT 'subscription' CHECK (license_type IN ('subscription', 'perpetual', 'per_seat', 'site', 'open_source')),
  seats_purchased INTEGER DEFAULT 0,
  seats_used INTEGER DEFAULT 0,
  cost_per_seat DECIMAL(10,2),
  total_monthly_cost DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'EUR',
  billing_cycle VARCHAR(20) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'annual')),
  start_date DATE,
  expiry_date DATE,
  auto_renew BOOLEAN DEFAULT FALSE,
  renewal_cost DECIMAL(12,2),
  admin_url TEXT,
  notes TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licenses_expiry ON licenses(expiry_date);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

CREATE TABLE IF NOT EXISTS license_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  UNIQUE(license_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_license_seats_license ON license_seats(license_id);
CREATE INDEX IF NOT EXISTS idx_license_seats_user ON license_seats(user_id);

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('vendor', 'client', 'employee', 'nda', 'partnership', 'lease', 'service', 'other')),
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft', 'pending_signature', 'active', 'expiring', 'expired', 'terminated', 'renewed')),
  counterparty_name VARCHAR(255) NOT NULL,
  counterparty_email VARCHAR(255),
  counterparty_type VARCHAR(30) CHECK (counterparty_type IN ('vendor', 'client', 'employee', 'partner')),
  crm_company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  finance_vendor_id UUID REFERENCES finance_vendors(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  total_value DECIMAL(15,2),
  currency VARCHAR(3) DEFAULT 'EUR',
  total_value_eur DECIMAL(15,2),
  payment_terms TEXT,
  start_date DATE,
  end_date DATE,
  signed_date DATE,
  effective_date DATE,
  auto_renew BOOLEAN DEFAULT FALSE,
  renewal_period_months INTEGER,
  renewal_notice_days INTEGER DEFAULT 30,
  next_renewal_date DATE,
  document_url TEXT,
  document_text TEXT,
  dora_extracted_terms JSONB,
  dora_extraction_confidence DECIMAL(3,2),
  description TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  owner_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_type ON contracts(type);
CREATE INDEX IF NOT EXISTS idx_contracts_end ON contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_counterparty ON contracts(counterparty_name);
CREATE INDEX IF NOT EXISTS idx_contracts_company ON contracts(crm_company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_vendor ON contracts(finance_vendor_id);

CREATE TABLE IF NOT EXISTS contract_signatories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  signing_order INTEGER DEFAULT 1,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'declined')),
  signed_at TIMESTAMPTZ,
  signature_data TEXT,
  ip_address VARCHAR(50),
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_sigs_contract ON contract_signatories(contract_id);

CREATE TABLE IF NOT EXISTS contract_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  obligation_type VARCHAR(30) CHECK (obligation_type IN ('deliverable', 'payment', 'sla', 'compliance', 'reporting', 'other')),
  responsible_party VARCHAR(30) CHECK (responsible_party IN ('us', 'counterparty', 'both')),
  due_date DATE,
  recurring VARCHAR(20) CHECK (recurring IN ('one_time', 'weekly', 'monthly', 'quarterly', 'annual')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'overdue', 'waived')),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_obligations_contract ON contract_obligations(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_obligations_due ON contract_obligations(due_date);

CREATE TABLE IF NOT EXISTS contract_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  reminder_days_before INTEGER NOT NULL,
  reminder_date DATE NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  recipient_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_reminders_date ON contract_reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_contract_reminders_sent ON contract_reminders(sent) WHERE sent = FALSE;

INSERT INTO asset_categories (name, description, depreciation_method, useful_life_months) VALUES
  ('Laptops', 'Employee laptops and notebooks', 'straight_line', 36),
  ('Monitors', 'Displays and screens', 'straight_line', 48),
  ('Mobile Devices', 'Phones and tablets', 'straight_line', 24),
  ('Furniture', 'Desks, chairs, and office furniture', 'straight_line', 84),
  ('Networking', 'Routers, switches, access points', 'straight_line', 60),
  ('Peripherals', 'Keyboards, mice, headsets, webcams', 'straight_line', 24),
  ('Vehicles', 'Company vehicles', 'declining_balance', 60),
  ('Other', 'Miscellaneous assets', 'none', NULL)
ON CONFLICT DO NOTHING;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_asset_summary AS
SELECT
  ac.name AS category_name,
  COUNT(a.id)::int AS total_assets,
  COUNT(a.id) FILTER (WHERE a.status = 'assigned')::int AS assigned,
  COUNT(a.id) FILTER (WHERE a.status = 'available')::int AS available,
  COUNT(a.id) FILTER (WHERE a.status = 'in_maintenance')::int AS in_maintenance,
  COALESCE(SUM(a.purchase_cost_eur), 0)::numeric AS total_purchase_value,
  COALESCE(SUM(a.current_value), 0)::numeric AS total_current_value,
  COUNT(a.id) FILTER (WHERE a.warranty_end < CURRENT_DATE + INTERVAL '30 days' AND a.warranty_end >= CURRENT_DATE)::int AS warranty_expiring_30d
FROM asset_categories ac
LEFT JOIN assets a ON a.category_id = ac.id
GROUP BY ac.name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_asset_summary_cat ON mv_asset_summary(category_name);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_license_utilization AS
SELECT
  l.id AS license_id,
  l.software_name,
  l.vendor,
  l.seats_purchased,
  l.seats_used,
  CASE WHEN l.seats_purchased > 0
    THEN ROUND((l.seats_used::numeric / l.seats_purchased * 100), 1)
    ELSE 0
  END AS utilization_percent,
  l.total_monthly_cost,
  l.expiry_date,
  l.auto_renew,
  l.status,
  CASE
    WHEN l.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN l.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'active'
  END AS expiry_status,
  CASE WHEN l.seats_purchased > 0 AND l.seats_used::numeric / l.seats_purchased < 0.5
    THEN TRUE ELSE FALSE
  END AS is_underutilized
FROM licenses l;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_license_util_id ON mv_license_utilization(license_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_contract_renewals AS
SELECT
  c.id AS contract_id,
  c.title,
  c.type,
  c.counterparty_name,
  c.total_value_eur,
  c.end_date,
  c.auto_renew,
  c.status,
  (c.end_date - CURRENT_DATE)::int AS days_until_expiry,
  CASE
    WHEN c.end_date < CURRENT_DATE THEN 'expired'
    WHEN c.end_date < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_30d'
    WHEN c.end_date < CURRENT_DATE + INTERVAL '60 days' THEN 'expiring_60d'
    WHEN c.end_date < CURRENT_DATE + INTERVAL '90 days' THEN 'expiring_90d'
    ELSE 'active'
  END AS renewal_status
FROM contracts c
WHERE c.status IN ('active', 'expiring')
ORDER BY c.end_date ASC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_contract_renewals_id ON mv_contract_renewals(contract_id);
