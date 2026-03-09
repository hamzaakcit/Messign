-- Add EUR-denominated columns for multi-currency reporting
-- Required by invoiceService.create and invoiceService.update
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal_eur DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount_eur DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount_eur DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS grand_total_eur DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount_eur DECIMAL(12,2) DEFAULT 0;
