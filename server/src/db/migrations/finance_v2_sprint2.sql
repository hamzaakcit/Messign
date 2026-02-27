-- Finance v2 Sprint 2 Migration
-- Aligns invoice_line_items schema for both employee and finance invoice systems
-- All statements are idempotent

-- Ensure invoice_line_items has columns needed by invoiceService.ts
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS quantity DECIMAL(10,2) NOT NULL DEFAULT 1;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 0;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS line_total DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Ensure invoice_line_items retains columns needed by employee invoice system (pdfService.ts)
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS amount_eur NUMERIC(12,2);
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12,2);
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS original_currency VARCHAR(3);
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS expense_id UUID;

-- Ensure invoices table has all columns needed by finance invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(30) DEFAULT 'standard';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_name VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_email VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS to_name VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS to_email VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS to_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS to_tax_id VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vendor_id UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_pct DECIMAL(5,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100) DEFAULT 'Net 30';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_instructions TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recurring_config JSONB;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS parent_recurring_id UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(3,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS template_id VARCHAR(50) DEFAULT 'default';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
