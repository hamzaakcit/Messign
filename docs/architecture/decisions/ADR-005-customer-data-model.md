# ADR-005: New CDP-lite tables (profiles, identifiers, events, consents, suppressions); CRM frozen

- **Status:** Accepted (2026-11-07, with D-01)
- **Context:** No consumer profile model exists. CRM contacts/leads are B2B (company, owner, lead scoring) and carry no consent. `marketing_email_campaigns` has no tenant column.
- **Decision:** Tables and identifier policy as in target-state §B:
  - The tenant's external customer ID is primary and required.
  - Email/phone are secondary, one active value per type per profile, with inactive history kept.
  - Consent is an append-only ledger plus a materialized current state. Default is no consent.
  - Address-level suppressions survive erasure as salted hashes.
  - Events are partitioned monthly with dedup on `client_event_id`.
  - No anonymous profiles or merge in 90 days.
- **Consequences:** + correct shape for e-commerce and İYS. − no reuse of existing CRM data (not needed by the design partners).
- **Rejected:** extending `crm_contacts` (wrong constraints, no RLS consistency); a generic EAV attribute table (jsonb is enough at this scale).
