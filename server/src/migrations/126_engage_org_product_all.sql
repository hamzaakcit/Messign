-- ADR-016: the platform organization may use engage as well as the Company-OS modules (one Lucy page for both).
-- Product 'all' means both. An operator sets it for the platform organization only (npm run engage:platform);
-- nothing sets it automatically, so applying this migration changes no organization.
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_product_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_product_check CHECK (product IN ('workspace', 'engage', 'all'));
