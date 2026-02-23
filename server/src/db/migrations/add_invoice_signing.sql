-- Invoice Signing Migration
-- Adds signed_at and signature_snapshot to invoices for per-invoice digital signing

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'signed_at'
    ) THEN
        ALTER TABLE invoices ADD COLUMN signed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'signature_snapshot'
    ) THEN
        ALTER TABLE invoices ADD COLUMN signature_snapshot TEXT;
    END IF;
END $$;
