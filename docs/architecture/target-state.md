# Architecture: Target State (90 days) and Direction (12 months)

**As of:** 2026-11-07 (Session A2). Status: **proposed**. Current state: `current-state.md`. Decisions: `decisions/ADR-001…009`.

## 0. Shape

```
                    ┌──────────────── existing platform (kept) ─────────────────┐
                    │ auth/JWT · users/roles · AI gateway + HITL · Lucy content │
                    │ gatekeepers · approval queue · Unlayer templates · images │
                    └───────────────────────────┬───────────────────────────────┘
tenant backend ──API key──▶ /api/engage/v1 ─────┤
CSV import ──────────────▶                      ▼
                    ┌──────────────── engage (new, schema `engage`) ────────────┐
                    │ profiles · identifiers · events(partitioned) · consents   │
                    │ suppressions · segments · journeys(versioned)             │
                    │ enrollments · step_runs · messages · message_events       │
                    │ channel_accounts(encrypted) · tenant_readiness · ledger   │
                    └──────┬──────────────────────────────┬─────────────────────┘
                           │ pg-boss (single executor)     │
                           ▼                               ▼
              journey executor ──▶ send pipeline: gate → render → adapter → ledger
                                                   │
                       mock+DLR sim · tenant ESP · Alaris (domestic) · Meta Cloud API
                                                   │
                         signed webhooks ◀─────────┘  (status/DLR/bounce/complaint)
```
Company-OS modules stay in the repo, frozen behind `PRODUCT_SURFACE` (ADR-001).

---

## A. Multi-tenancy (ADR-002, ADR-006)

**Current:** RLS designed but not enforced; app hard-codes org `messign`; three tenant keys; no provisioning; no API keys; platform-wide credentials.

**90-day design**
- **Tenant key:** `organization_id UUID NOT NULL REFERENCES organizations(id)` on every `engage.*` table; RLS `ENABLE` + `FORCE`; policy `USING/WITH CHECK (organization_id = current_tenant_id())`. No `tenant_id`/`workspace_id` in new tables.
- **Access paths:** engagement code uses only `withTenantQuery(orgId, …)`. A lint test fails CI if `server/src/engage/**` imports `pool` or `query` directly.
- **Auth:** new `requireEngageUser` middleware: JWT `organizationId` claim required, must equal the user row's org, **no default-org fallback**, role from row. New `requireApiKey` for ingestion: hashed keys in `engage.api_keys` (prefix + sha256), scoped (`ingest`, `journeys:trigger`), per-key rate limit.
- **Provisioning:** admin-only `POST /api/engage/admin/organizations` (super-admin role) creates an org, first user and default settings. Self-serve signup is out of scope.
- **Per-tenant messaging credentials:** `engage.channel_accounts(organization_id, channel, provider, mode test|live, config jsonb, secret_ciphertext, key_id, rotated_at, status)`. Envelope encryption, write-only via API, redacted in logs, fail-closed (ADR-006).
- **Per-tenant settings:** timezone (default Europe/Istanbul), quiet hours, frequency caps, monthly budget caps per channel, AI monthly token cap, data retention days for events.
- **DB role:** production `DATABASE_URL` uses `messign_app` (NOBYPASSRLS); boot-time check refuses to start the engage module if `rolbypassrls` or `rolsuper` is true and `NODE_ENV=production`.

**Tenant-isolation adversarial test plan (acceptance bar)**

Runs in CI against a real Postgres service container as `messign_app`. Two orgs A/B, seeded with profiles, events, consents, journeys, messages, channel_accounts.
1. For every `engage.*` table: query under tenant A returns 0 rows of B; INSERT with `organization_id = B` under tenant A fails; UPDATE/DELETE of B's rows affects 0 rows.
2. No-context query (no `app.current_tenant`) returns 0 rows on every engage table.
3. Schema guard: a test enumerates `pg_class` for schema `engage` and fails if any table lacks `relrowsecurity AND relforcerowsecurity` or lacks `organization_id NOT NULL`.
4. HTTP: user JWT for A requesting B's profile/journey/message ids → 404. API key of A ingesting with B's id in the body → org from the key wins, body field ignored or rejected.
5. Webhooks: provider callback whose account id maps to A cannot update B's message.
6. Job payloads: a pg-boss job carrying org A cannot load B's enrollment (the executor re-derives org from the row, never trusts the payload alone).
7. Credentials: API never returns `secret_ciphertext`; logs scrubbed (test greps captured logs).
8. Timing: org-switching within one pooled connection does not leak (`set_config(..., true)` is transaction-local; test runs A then B on the same client).

**Deferred:** retrofitting RLS to the 207 legacy tables, multi-org users, SSO, per-tenant DB.
**Rejected:** schema-per-tenant (migration fan-out, solo founder); `tenant_id` as the new key (1,128 existing `organization_id` references; one name beats two).

## B. Customer data model — CDP-lite (ADR-005)

**Current:** none; CRM is B2B. **Decision:** new tables; CRM untouched and frozen.

```
engage.profiles      (id, organization_id, external_id text NOT NULL, attributes jsonb, timezone, locale,
                      created_at, updated_at, erased_at)           UNIQUE(organization_id, external_id)
engage.identifiers   (id, organization_id, profile_id, type email|phone|external, value_normalized,
                      is_active bool, first_seen_at, deactivated_at)
                      UNIQUE(organization_id, type, value_normalized) WHERE is_active  -- one active owner per value
                      partial UNIQUE(organization_id, profile_id, type) WHERE is_active AND type<>'external'
engage.events        (organization_id, id, profile_id, client_event_id, name, properties jsonb,
                      occurred_at, received_at) PARTITION BY RANGE(occurred_at) monthly
                      UNIQUE(organization_id, client_event_id, occurred_at)          -- dedup
engage.consents      (id, organization_id, profile_id, channel sms|email|call|whatsapp, purpose marketing,
                      status granted|revoked, source iys|web|import|api|unsubscribe_link|stop_keyword,
                      evidence jsonb, recorded_at, iys_synced_at)  -- append-only ledger
engage.consent_state (organization_id, profile_id, channel, purpose, status, updated_at) -- materialized latest
engage.suppressions  (organization_id, channel, value_normalized, reason hard_bounce|complaint|opt_out|manual|invalid,
                      created_at)  -- address-level, survives profile deletion
```
- **Identifier policy:** tenant's customer ID is primary (`external_id`, required, non-guessable). Email/phone are secondary; only one active value per type per profile. Old values are kept as inactive identifiers for matching. `POST /identify/update` changes an identifier without losing history (deactivate old, insert new).
- **Phone normalization:** E.164 (TR default +90); email lower-case + trim.
- **Consent:** default **no consent** (fail-closed). Transactional purpose is not stored as consent — it is a message attribute. Opt-out writes the ledger + state + suppression in one transaction.
- **Erasure (KVKK/GDPR):** `POST /profiles/:id/erase` nulls attributes, deletes identifiers and events, sets `erased_at`, keeps pseudonymised ledger rows (consents, messages) per the 10-year rule **[LC]**. Suppressions keep a salted hash of the address so an erased person is not re-messaged.
- **Import/export:** CSV import of profiles + consents (with evidence columns) via a pg-boss job; JSON export per profile.
- **Anonymous profiles/merge:** **not in 90 days** — the first use case is logged-in cart abandonment.

**Rejected:** reusing `crm_contacts`/`marketing_leads` (B2B shape, no tenant column on email campaigns, no consent); identity graph.

## C. Event ingestion (ADR-007)

- `POST /api/engage/v1/profiles:upsert` — `{external_id, identifiers{email,phone}, attributes{}, consents[]?, skip_triggers?}`.
- `POST /api/engage/v1/events:track` — batch ≤500: `{client_event_id, external_id, name, occurred_at, properties}`.
- `POST /api/engage/v1/journeys/{key}/trigger` — `{external_id, idempotency_key (required), payload, create_if_missing?}`.
- Validation: zod schemas. Reserved e-commerce events for v1: `cart_updated`, `checkout_started`, `order_completed`, `product_viewed` (optional), `profile_attribute_changed`.
- **Dedup:** `(organization_id, client_event_id)`; replays return 200 with `duplicate: true`.
- **Ordering tolerance:** journeys evaluate by `occurred_at`. Exit conditions check "any `order_completed` with `occurred_at` ≥ enrollment start", so out-of-order arrival is safe.
- **Durability:** insert event + enqueue `engage/evaluate-triggers` in **one transaction** (pg-boss `send` with the same client, or an outbox row drained by pg-boss). Failed evaluations go to a pg-boss dead-letter queue with an admin replay endpoint.
- **Storage:** monthly partitions, created ahead by a job; retention per tenant (default 13 months), dropped by partition.
- **Connectors:** decided after learning what Kitapyurdu and Lilyana run (pending decision D-06). Default assumption: the tenant's backend calls the API; CSV for history.
- **Deferred:** JS/mobile SDKs, schema registry, streaming (Kafka), replay UI.

## D. Journey / campaign execution (ADR-003)

**Decision:** build a minimal **new** engine in `server/src/engage/journeys`. Reuse only the patterns from `marketing_automations` (HITL modes, run log). Execution runs on **pg-boss** only.

- **Definitions:** `engage.journeys(id, org, key, name, status)` + `engage.journey_versions(id, journey_id, version, definition jsonb, approved_by, approved_at, activated_at)`. Only one active version. Activation requires approval (principle 7). Definitions are immutable once activated.
- **Definition schema (v1):**
  - `trigger`: `event{name, filter}` | `api` | `segment_entry{segment_id}` (P1) | `date_attribute{attribute, offset_days, at_local_time}` (Lilyana)
  - `steps[]`: `delay{duration}` · `wait_until{event, filter, timeout, on_timeout:next|exit}` · `branch{condition on attributes/events → step ids}` · `message{channel, template_id, purpose marketing|transactional}` · `webhook{url, signed}` · `exit`
  - `exit_conditions[]`, e.g. `event order_completed after enrollment`
  - `re_entry{policy: never|after_exit|after_days N}` · `holdout_pct` (default 10) · `frequency_cap_override?`
- **Enrollment:** `engage.journey_enrollments(id, org, journey_version_id, profile_id, trigger_ref, idempotency_key, state active|completed|exited|failed, group treatment|holdout, current_step, next_run_at)`. UNIQUE `(org, journey_id, idempotency_key)`; re-entry policy enforced by query + unique partial index.
- **Execution:** each step is a pg-boss job `engage/step` keyed `{enrollment_id}:{step_index}:{attempt-free key}` (`singletonKey`) so retries cannot double-execute. Step results go to `engage.journey_step_runs` (UNIQUE `(enrollment_id, step_index)`). Delays use `startAfter`. Wait-until registers a waiter row; an incoming event wakes it, otherwise a timeout job fires.
- **Message step** creates `engage.messages` with `idempotency_key = hash(enrollment_id, step_index)` (UNIQUE), then calls the send pipeline. **Holdout** enrollments run every step except message sends; the would-have-sent outcome is recorded for analytics.
- **Frequency capping / quiet hours** are gate rules (section E), not journey logic, so every path is covered.
- **Per-step analytics:** counts from `step_runs` + `messages` + `message_events` + conversions (`order_completed` within the attribution window).
- **Builder UI:** form/list-based step editor over the JSON definition. Visual canvas deferred.

**Why pg-boss, not BullMQ:** jobs live in the same Postgres as enrollments, so enqueue can be **transactional** with the state change (no lost or ghost jobs). It needs no Redis for correctness, is already in use (`services/jobQueue.ts`), and its throughput is ample for pilot volume. BullMQ and the crons stay frozen for Company-OS features.

## E. Messaging layer (ADR-004, ADR-006, ADR-008)

```
message request (journey step | API trigger)
  → resolve recipient (active identifier for channel)
  → SEND GATE (single choke point, writes engage.send_decisions)
       global SEND_MODE: off | sandbox | live        (env, default off)
       tenant readiness: send_enabled + per-channel legal readiness rows (sender ID / İYS brand code / domain / WABA)
       channel account present, status active, mode matches SEND_MODE
       purpose=marketing → consent_state granted for (channel, marketing)
       suppression list (address-level) — applies to transactional too, except hard-safety overrides [LC]
       quiet hours (tenant tz; marketing only)
       frequency cap (per profile per channel per rolling window; marketing only)
       budget cap (cost ledger month-to-date + estimate ≤ cap)
       content checks: commercial SMS/email contains opt-out instruction; SMS sender ID valid 3–11 chars
  → render (template + profile attributes; no LLM)
  → adapter.send() with idempotency key, provider capability check
  → ledger: engage.messages(status queued→sent→delivered|failed|bounced…, provider_message_id, cost_estimate)
  → status ingestion: signed webhook → normalized engage.message_events → suppression updates (hard bounce, complaint, STOP)
```
- **Adapter interface:** `capabilities()` (channels, unicode, link support, domestic_tr, delivery_reports, max_tps), `send(msg, account)`, `parseWebhook(req, account)` with signature verification, `normalizeError()`. No vendor names in core.
- **Adapters (in order):** (1) **mock + DLR simulator**, with configurable delays, failure rates, duplicate and out-of-order DLRs; (2) **email** on the tenant's ESP (D-05); (3) **WhatsApp Cloud API** once Meta verification lands; (4) **Alaris-based HTTP/SMPP** only against real docs — no guessed DLR formats.
- **Retries:** exponential backoff for transient errors only (429/5xx/timeouts). Hard errors are final. Every retry reuses the same idempotency key; providers that support it get it passed through.
- **Kill switch:** setting `SEND_MODE=off` stops all sends within one job cycle. A per-tenant `send_enabled=false` does the same for one tenant. Drilled before the pilot.
- **Provider health:** rolling success/latency per account; the gate can mark an account `degraded`. Fallback routing is deferred (12m).
- **Existing publisher adapters** (`services/marketing/publishing/*`) are **not** used by engage and stay frozen. The publisher cron defaults OFF.

## F. AI layer (ADR-009)

**Current:** Dora v1+v2, two gateways, telemetry only on chat, no prompt versioning, HITL real.

**Minimum AI that sells in 90 days:** (1) draft journey email copy and subject lines from brand profile + product truth + journey intent, through the existing gatekeepers, landing in the approval queue; (2) suggest a journey configuration from a template (e.g. delay timing) — suggestion only.

- **Gateway:** all engage AI calls go through `services/ai/gateway.ts`. `llmGateway.ts` callers are wrapped with the same telemetry hook. Every call writes `ai_request_telemetry` (org, feature, model, tokens in/out, cost estimate, latency). Per-tenant monthly cap is enforced before the call.
- **Data isolation:** **no personal data in prompts** (compliance R-5). Context = brand profile, product truth, template, aggregate metrics only.
- **Prompt versioning:** prompts referenced by `id@version` constants; the version is recorded in telemetry and on the approval item.
- **Permissions:** AI has no tool that sends, changes audiences, spends or deletes. It can only create draft content and suggestions.
- **Evaluation:** keep the gatekeeper red-team suite; add a small golden set for Turkish e-commerce copy (5–10 cases) run on demand.
- **Frozen:** Dora chat assistant, insights, briefings, cross-module tools, autonomous automations, competitor intelligence.

---

## Channel ownership strategy (master-prompt §8)

| | **Email** | **SMS** | **WhatsApp** |
|---|---|---|---|
| Build/buy/postpone | **Buy** the ESP (tenant's account); **build** the adapter, webhooks, suppression | **Buy** delivery (tenant's Alaris-platform account); **build** the adapter + gate; **postpone** owned SMPP/operator links | **Buy** Meta Cloud API directly (tenant's WABA); build the adapter. No BSP unless the tenant already has one |
| First production architecture | Tenant domain with SPF/DKIM/DMARC; one ESP adapter; List-Unsubscribe + one-click; bounce/complaint webhooks → suppression | Tenant account on the Alaris-based platform, **domestic TR route** (links blocked from abroad); tenant başlık (3–11 chars); HTTP API first, SMPP only if the docs require it; DLR webhook/poll per docs | Tenant WABA + number; templates with category; webhooks (status, inbound STOP-like replies → opt-out); quality-rating monitor |
| Long-term (12m+) | Second ESP; dedicated IP guidance for high-volume tenants; deliverability dashboard | Multi-route per tenant with fallback; route cost/delivery analytics; then managed (resold) traffic once the Q6 triggers are met; direct operator connections only when monthly volume justifies negotiation and licensing **[LC]** | Template library, utility-message flows (order/shipping), click-to-WhatsApp |
| Operational complexity | Low–medium (DNS help, warm-up) | High (başlık approvals, İYS, operator rules, link restrictions, DLR formats) | Medium (verification, template approval, quality rating, quarterly price changes) |
| Key risks | Tenant domain reputation; Gmail/Yahoo bulk-sender rules (one-click unsubscribe) **(A, verify)** | Account and başlık lead time; international route blocking links; misclassified commercial traffic | Verification delays; template rejections; pricing changes (Meta updates rates quarterly — V) |
| Commercial advantage | Parity | Hamza's real edge once live (routing, DLR truth, cost) | Very low Turkish rates (marketing ≈ $0.0109, utility ≈ $0.0009 — V) make WhatsApp utility flows cheap |

- **Push / web push:** postpone (needs SDKs; no customer request).
- **RCS:** postpone (operator availability in TR unverified; Insider is investing via Google — V).
- **Shared vs dedicated IP:** shared ESP pool for the pilot; dedicated only above roughly 100k emails/month per tenant **(A)**.
