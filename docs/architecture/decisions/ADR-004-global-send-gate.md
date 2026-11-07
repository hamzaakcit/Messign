# ADR-004: One send gate, default OFF, with per-tenant legal readiness and a decision ledger

- **Status:** Accepted (2026-11-07, with D-01)
- **Context:** Existing adapters go live on token presence or `*_FORCE_REAL` flags with inconsistent polarity. The publisher cron runs every minute by default. No consent/suppression checks exist.
- **Decision:**
  1. `SEND_MODE` env = `off` (default, also when unset or invalid) | `sandbox` (only mock adapters and test-mode accounts) | `live`.
  2. `engage.tenant_readiness(organization_id, channel, item, value, evidence_url, recorded_by, recorded_at)`: e.g. `iys_brand_code`, `btk_sender_id`, `email_domain_authenticated`, `waba_verified`, `dpa_signed`. `engage.tenant_settings.send_enabled` defaults false and can only be set true when the required readiness items for that channel exist.
  3. A single `sendGate.evaluate(request)` is the only path to an adapter. It writes `engage.send_decisions` (allow/deny + every reason) **before** the provider call. It fails closed on any exception.
  4. Rules in order: global mode → tenant send_enabled → channel account active and mode-compatible → readiness → suppression → consent (marketing) → quiet hours (marketing) → frequency cap (marketing) → budget cap → content checks.
  5. Legacy: `MARKETING_PUBLISHER_ENABLED` default flips to OFF. Legacy adapters must also consult `SEND_MODE` (a one-line guard) until the publisher is removed.
- **Consequences:** + one auditable kill switch; legal readiness is explicit data, not tribal knowledge. − every new adapter must go through the gate (intended).
- **Rejected:** per-adapter flags; gate checks inside journeys only (would miss API-triggered and manual sends).
