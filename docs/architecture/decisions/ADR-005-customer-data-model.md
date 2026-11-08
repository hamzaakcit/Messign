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

## Implementation notes (WP-07, 2026-11-08)
- **Migration `113_engage_profiles.sql`:** `profiles`, `identifiers`, `consents`, `consent_state`, `suppressions`, all with forced RLS on `organization_id`.
- **Identifier rules live in the database:** one active owner per email/phone/external value per tenant; one active email and one active phone per profile; values must already be normalized (email lower-case and trimmed, phone E.164) or a CHECK rejects the row; `is_active` must agree with `deactivated_at`. Service-level normalization (`engage/profiles.ts`) accepts Turkish national forms (0532..., 532..., 90532..., 0090...) and treats any other bare number as invalid rather than guessing a country.
- **Tenant-safe children:** `identifiers`, `consents` and `consent_state` reference `profiles (organization_id, id)`, so a row cannot point at another tenant's profile even if the tenant context is right.
- **Consent:** the ledger is append-only for the engage role (only `iys_synced_at` may be stamped later). A grant that did not come through IYS must carry evidence (CHECK). `consent_state` cannot be written by the application at all: a SECURITY DEFINER trigger (`engage.apply_consent`) maintains it, and an older decision arriving late never overwrites a newer state. Only the `marketing` purpose exists.
- **Suppressions:** append-only, unique per tenant, channel and address; a recipient opt-out (unsubscribe link, STOP keyword) writes ledger, state and suppression in one transaction; an API revocation withdraws consent but does not suppress the address. `isSuppressed` fails closed on an address it cannot normalize. The salted-hash form for erased people arrives with WP-35.
- **No deletes:** the engage role cannot delete profiles or identifiers (erasure in WP-35 nulls and deactivates, so the 10-year ledger keeps its profile row).
- **API:** read-only `GET /api/engage/profiles/:id` for tenant users (404 for another tenant's id). Writes come with ingestion (WP-08) and CSV import (WP-09); `upsertProfile`, `recordConsent`, `addSuppression`, `isSuppressed`, `hasConsent` are the service surface they will use.
- **Not done:** events table (WP-08), erasure and export (WP-35), IYS sync (WP-26), the send gate's use of `hasConsent` / `isSuppressed` (WP-11).
