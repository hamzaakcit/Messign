# Backlog

**Convention:** Work packages (WP) are session-sized and ordered. Status: `todo` · `in-progress` · `done` · `blocked(reason)` · `dropped`. Update this file at the end of every session. Week mapping: `90-day-roadmap.md`.

## Ready / committed (90 days)

| WP | Title | Pri | Week | Status | Acceptance (short) |
|---|---|---|---|---|---|
| WP-01 | Safety & CI baseline: fix server `tsc`; CI runs unit tests (Node 22); `SEND_MODE` guard on legacy adapters; publisher cron default OFF; remove `x-user-id` dev auth; rewrite `db:verify-rls` to test via a non-bypass role | P0 | W1 | done | CI red on failing test; unset `SEND_MODE` → mock everywhere; `tsc` clean |
| WP-02 | Repo cleanup + `PRODUCT_SURFACE` flag + CLAUDE.md refresh + README product line (`dal/time` kept pending D-10 review) | P0 | W1 | done | Removed list per ADR-001; frozen routes 404 under `engage` |
| WP-03 | Migration baseline (`000_baseline`), single runner, delete duplicate migration dir, no new runtime DDL | P0 | W1 | done | Fresh DB = live schema (diff empty) |
| WP-04 | `engage` schema; dedicated `messign_engage` role + separate engage pool (ADR-002 amendment); org `product`; api_keys; tenant_settings; tenant_readiness; `requireEngageUser`; `requireApiKey`; admin org provisioning; BYPASSRLS boot check | P0 | W2 | done | Two orgs provisioned; no fallback org on engage routes |
| WP-05 | Tenant-isolation adversarial harness (CI Postgres as `messign_app`, schema guard, import lint) | P0 | W2 | done | target-state §A tests 1–4, 7, 8 green |
| WP-06 | Credential store (ADR-006) | P0 | W2 | done | Write-only, fail-closed, rotation, redaction tests |
| WP-07 | Profiles, identifiers, consents (+state), suppressions | P0 | W3 | done | One active email/phone per profile enforced in the DB |
| WP-08 | Ingestion API v1 (upsert, identify/update, track, trigger stub), dedup, partitions, transactional enqueue | P0 | W3 | done | Duplicate event → one row; OpenAPI published |
| WP-09 | CSV import (profiles, consents with evidence, orders) + synthetic tenant generator (bookstore, florist) feeding the importer | P0 | W3 | done | 100k round-trip; generator emits only test phone ranges/`example.*` emails |
| WP-10 | Messaging core: adapter interface, messages ledger, idempotency, mock adapter, DLR simulator | P0 | W4 | done | Duplicate/out-of-order DLRs handled |
| WP-11 | Send gate full rules + `send_decisions` + rate cards/budget caps + sandbox recipient allowlist + kill switch | P0 | W4 | done | Adversarial consent/suppression/budget/allowlist suite green |
| WP-12 | Email adapter (provider-neutral; sandbox ESP now, tenant ESP at business start) + signed webhooks + bounce/complaint suppression | P0 | W5 | done (real SES sandbox send delivered and reported, 2026-11-08) | Forged webhook rejected; delivery to verified test inbox |
| WP-13 | Unsubscribe token + one-click List-Unsubscribe + preference page | P0 | W5 | done (opt-out blocks the next send; not yet seen by a real mailbox provider) | Opt-out effective before next send |
| WP-14 | Template rendering from Unlayer HTML with safe variables + preview | P0 | W5 | done (API and service; editor UI with WP-20) | Missing variable → deny |
| WP-15 | Journey definitions, versions, approval/activation | P0 | W6 | done (definitions and lifecycle; nothing runs until WP-16) | Unapproved version cannot activate |
| WP-16 | Executor: event/API triggers (idempotency key), delay, wait-until/timeout, exit conditions | P0 | W6 | done (ADR-012) | Retry → no duplicate step effect |
| WP-17 | Branch, re-entry, holdout, message-step integration | P0 | W6 | done (plus the dispatcher; ADR-012 §8) | Holdout 10% ±2% over 10k |
| WP-18 | Cart-abandonment template + event simulator + 10k load | P0 | W7 | done (ADR-012 §9) | Zero duplicate messages; correct exits |
| WP-19 | Engage UI shell + profile list/detail with audit trail | P0 | W7 | done (Playwright E2E: playwright.engage.config.ts, not in CI) | Message traceable to gate decision + consent |
| WP-36 | Rule-based segments (attributes + order history) + scheduled segment trigger (win-back / new-release on imported data) | P0 | W7 | done (API only; UI with WP-20; ADR-013) | Segment counts match SQL; scheduled run enrolls once per profile per run |
| WP-20 | Journey builder UI (form-based) | P0 | W8 | done (journeys, segments, templates screens; Playwright: create and activate in the UI) | Create + activate fully in UI |
| WP-21 | Analytics: funnel, delivery, conversions vs holdout with CI | P0 | W8 | todo | Reconciles with ledger SQL |
| WP-22 | Settings UI: channel accounts, readiness, quiet hours, caps, send_enabled | P0 | W8 | todo | send_enabled blocked without readiness |
| WP-23 | AI gateway metering for all callers + per-tenant cap | P0 | W9 | todo | Telemetry row per call |
| WP-24 | AI copy drafting for message steps → gatekeepers → approval queue (no PII) | P1 | W9 | todo | PII-in-prompt test green |
| WP-25 | Date-attribute trigger + florist occasion template (synthetic data) | P1 | W9 | todo | Fires once per occurrence |
| WP-26 | İYS client from public docs + mock İYS server (pull consents, push opt-outs, SLA monitor); live at business start | P1 | W10 | todo | Revocation honoured before next send (against mock) |
| WP-27 | WhatsApp Cloud API adapter (own Meta dev app + test number) | P1 | W10 | todo | Marketing template blocked without WhatsApp consent |
| WP-28 | Alaris-based SMS adapter from real docs; domestic-route capability (confirmed available) | cond. | W11 | blocked(E4 docs) | Every mapping cites the docs |
| WP-29 | Ops: provider health, alerts, error tracking, restore test | P0 | W11 | todo | Drill fires alerts |
| WP-30 | Sandbox E2E across test ladder (+ step 4 if eligible) | P0 | W11 | todo | E2E report |
| WP-31 | Security hardening (seed routes, rate limits, engage audit hash chain, deps, CSP, secrets scan) | P0 | W12 | todo | Checklist closed/accepted |
| WP-32 | Performance baseline (1M events, 50k enrollments) | P1 | W12 | todo | Numbers recorded |
| WP-35 | Erasure + export (data-subject requests) | P0 | W12 | todo | Erasure keeps pseudonymised ledger + suppression hash |
| WP-33 | Onboarding kit (CSV templates, readiness checklist, DPA/DNS/başlık list, demo script) + runbook + kill-switch drill | P0 | W13 | todo | Checklist maps 1:1 to `tenant_readiness` |
| WP-34 | Business-start dry run: onboard a fresh synthetic tenant from zero using only the kit | P0 | W13 | todo | ≤ 1 working day; gates 4–8 evidenced |

## Post-90-day backlog (speculative until a real customer asks — principle 1)

| Item | Trigger to promote |
|---|---|
| **Business start: Kitapyurdu onboarding** (B1–B7 in roadmap) → internal-staff pilot → 100–500 consented customers | Business officially starts |
| Real-time cart abandonment for a live tenant | Tenant agrees to send events via API (B8) |
| SMS live on Kitapyurdu's account | Başlık + İYS + Alaris docs + domestic route confirmed |
| WhatsApp utility flows (order/shipping) | Tenant WABA verified and tenant asks |
| E-commerce platform connector (Ticimax/ikas/IdeaSoft/Shopify/custom) | D-06 answers + second tenant on the same platform |
| JS snippet + anonymous profiles + merge | Measured share of anonymous carts justifies it |
| Visual journey canvas | Tenant feedback that forms block adoption |
| A/B tests on copy (multi-candidate generation, Content Studio A1) | Volume high enough for significance |
| Türkiye-hosted deployment | D-04 outcome / buyer requirement |
| Managed messaging (resale), margin on cost ledger | Product-vision Q6 triggers met |
| Billing (Paddle or local) | Messign entity exists + first paid contract |
| Legacy RLS retrofit / Company-OS cleanup or extraction | Company OS gets a buyer, or frozen code blocks engage |
| Remove dead columns (`dora_score`, `dora_next_action`, `tokens_used`) | When touching CRM/finance |
