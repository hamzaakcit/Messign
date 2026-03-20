-- Persist Product Truth Validator output on marketing content (optional; set when submitting for review)

ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS truth_validation JSONB,
  ADD COLUMN IF NOT EXISTS truth_validated_at TIMESTAMPTZ;

COMMENT ON COLUMN marketing_content.truth_validation IS 'Last product truth validator JSON result (PASS/FAIL + checks)';
COMMENT ON COLUMN marketing_content.truth_validated_at IS 'When truth_validation was produced';
