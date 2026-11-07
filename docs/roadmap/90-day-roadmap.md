# 90-Day Roadmap — Messign Engage

**As of:** 2026-11-07 (Session A2, **v2** after Q-A: no tenant action until business start). Status: **approved 2026-11-07** (D-01). Kitapyurdu and Lilyana are prospects, not committed design partners (D-08). The plan targets *the first pilot tenant*, whoever signs first.

**90-day goal (v2): pilot-ready on business start day.** Every capability is proven end-to-end on synthetic tenants (a demo bookstore and a demo florist) with simulated events. Real sends go only to Hamza's own allow-listed test inboxes and numbers. Kitapyurdu and Lilyana are not asked to do anything inside the 90 days. **No real customer personal data in any environment.**
**Dates assume approval by Sun 2026-11-08**, so Week 1 starts Mon **2026-11-09**. Shift all dates if approval is later.
**Capacity:** 3 evening sessions/week = 39 slots. Plan v2 = **30 P0 sessions + 5 P1 + 1 conditional + 2 buffer + 1 retro** (39). If P1 and conditional WPs drop, the load is 30 P0 sessions, exactly the ~30 productive-session budget. Buffers are W4 S12 and W10 S30; slips are absorbed by dropping P1 work first. One work package (WP) = one session; split before starting if it won't fit. Backlog detail per WP: `backlog.md`.

## Phase map (modified from master-prompt §10.1)

| Phase | Weeks | Change vs starting structure |
|---|---|---|
| 1 — Reconnaissance & decisions | **done** (A1/A2, 7 Nov) + approval | Compressed. The audit is complete. |
| 2 — Foundation | W1–W4 | Adds repo safety (send gate default OFF, CI tests) in W1, because accidental real sends are possible today. |
| 3 — Core product (cart abandonment on email) | W5–W9 | Email channel arrives here, not Phase 4 — it is the pilot channel. |
| 4 — Channel & integration readiness | W10–W11 | İYS sync, WhatsApp, Alaris (each conditional on external access/docs). |
| 5 — Pilot readiness | W12–W13 | Ends with a **pilot-ready demo + tenant onboarding kit**. The live pilot starts after business start, once the pilot gate is green. |

## Pilot gate (all required before any live customer message — applies after business start)
1. Tenant legal readiness recorded in `engage.tenant_readiness`: authenticated email domain, İYS brand code, consent source with evidence for every recipient.
2. **Processor agreement in place and hosting/transfer position confirmed [LC]** — needs a Messign entity or a confirmed alternative (D-03, D-04).
3. Per-tenant `send_enabled` set through readiness checks; `SEND_MODE=live` only in the pilot environment.
4. Consent and suppression gate verified by the adversarial suite (green in CI).
5. Idempotency verified: duplicate events, job retries and DLR replays produce one message.
6. Kill switch drilled (global and per-tenant) with a timed result.
7. Audit trail verified: every message traceable to a gate decision, journey version, approver and consent record.
8. Tenant-isolation adversarial suite green.

## Default pilot design (D-08, applies to any first tenant)
| Element | Default |
|---|---|
| Scope | One journey (cart abandonment if the tenant sends events; otherwise win-back or occasion on imported data), one channel (email first), 4 weeks |
| Phase A | Internal staff (≤ 50 people, consent with evidence): 1 week, no commercial content risk |
| Phase B | 1,000–5,000 consented customers, **10% randomized holdout** (D-11) |
| Primary KPI | Revenue per enrolled customer within the attribution window (72h for cart, 7 days for win-back/occasion), treated vs holdout |
| Success threshold | Statistically significant positive uplift (95% CI excludes 0) **and** cost per message < 10% of incremental revenue. Absolute uplift target agreed with the tenant at kickoff |
| Guardrails (stop the pilot) | Unsubscribe rate > 1% per send · spam-complaint rate > 0.1% · any send outside the gate · any cross-tenant data access |
| Conversion | Pre-agreed: success → paid plan from month 2; failure → written learnings, no obligation |
| Prerequisites | Business-start list B1–B3 + pilot gate 1–8 |

## Critical path
WP-01 → WP-04 → WP-05 → WP-07 → WP-08 → WP-10 → WP-11 → WP-12 → WP-13 → WP-14 → WP-15 → WP-16 → WP-17 → WP-18 → WP-21 → WP-33 → WP-34
**External critical path (v2):** inside 90 days, only Alaris API docs (for WP-28). **The pilot date is set by business start**, followed by entity + processor agreement (D-03), consent/customer export (CSV) and DNS/başlık documents. Target: tenant live ≤ 2 weeks after those arrive.

## Runs in parallel (code vs paperwork)
Code W1–W13 runs alongside: Alaris API docs request (now); entity formation path and DPA template (before business start); hosting decision (before business start). Tenant-side processes start at business start.

## Must not start yet
Any send to a non-allow-listed recipient. Any real customer data. The Alaris adapter before real docs exist. Connectors before D-06 is answered. Visual journey canvas. Any Company-OS feature. Wallet/spread. Anonymous identity.

## Postponed / frozen / removed
Postponed: product-vision Q8 list. Frozen: ADR-001 list. Removed in WP-02: `dal/time`, `knowledge-hub/`, `knowledge-hub.zip/`, `*.dump`, root ComfyUI/Python scripts, `server/db/railway-dev-rls-unblock.sql`, `server/db/rls-optional-dev.sql`, `/api/seed/*` in production.

## Weekly review checkpoint
Last session of each week ends with 15 minutes: update `weekly-progress.md` (done / slipped / next), re-check the external-dependencies table, confirm next week's WPs. Phase-exit reviews: end of W4, W9, W11.

---

## Week 1 — 9–15 Nov 2026 · Phase 2
| Field | Content |
|---|---|
| Sessions | S1 WP-01 Safety & CI baseline · S2 WP-02 Repo cleanup + product-surface flag + CLAUDE.md · S3 WP-03 Migration baseline (conditional on the schema-only dump; otherwise buffer) |
| Objective | Make the repo safe to change: no accidental sends, tests gate merges, one migration path |
| Product outcome | None visible. Removes the risk that LinkedIn/Instagram/email adapters send from a misconfigured environment. |
| Engineering tasks | Fix `services/ai/gateway.ts:83` type error (pin or adapt `@anthropic-ai/sdk`); CI: Node 22, run server + client Vitest with Postgres/Redis service containers or `skipIf` guards; `SEND_MODE` guard in `publishing/adapters/*` + `MARKETING_PUBLISHER_ENABLED` default OFF; delete the `x-user-id` dev-auth path; rewrite `db:verify-rls` to test via a non-bypass role; remove dead code and clutter; `PRODUCT_SURFACE` mount gating in `index.ts`/`modules/registry.ts` + client nav; `000_baseline.sql` from live schema, single runner, delete `server/src/db/migrations/` |
| Architecture changes | ADR-001, ADR-004 (legacy guard part) |
| Dependencies | Schema-only dump of the live DB (`pg_dump -s`) from Hamza. The RLS check is done (D-07) |
| Deliverables | Green CI with tests; PR set; CLAUDE.md; baseline migration |
| Acceptance criteria | CI fails on a failing test; `SEND_MODE` unset → every legacy adapter returns mock; `tsc` clean in both workspaces; fresh DB from baseline + runner matches the live schema diff (`pg_dump -s` diff empty) |
| Tests | Unit tests for the guard per adapter; CI run; manual: boot with `PRODUCT_SURFACE=engage` → frozen routes return 404 |
| Risks | Live DB dump not available → WP-03 slips to W2 buffer |
| Priority | P0 |
| Effort | 3 sessions |
| Decision required | — (D-01 approved) |

## Week 2 — 16–22 Nov · Phase 2
| Field | Content |
|---|---|
| Sessions | S4 WP-04 Engage schema & tenancy foundation · S5 WP-05 Tenant-isolation adversarial harness · S6 WP-06 Credential store |
| Objective | Correct tenant boundaries for everything new |
| Product outcome | Multiple tenants (demo bookstore, demo florist; later Kitapyurdu, Lilyana) exist as separate, isolated orgs |
| Engineering tasks | Schema `engage`; dedicated `messign_engage` role (NOSUPERUSER, NOBYPASSRLS) + separate engage pool; `organizations.product`; `engage.api_keys`, `tenant_settings`, `tenant_readiness`; `requireEngageUser`, `requireApiKey`; admin org provisioning endpoint; boot check refusing a bypass role for engage; CI Postgres connects engage as `messign_engage`; schema-guard test; import-lint test; `channel_accounts` with envelope encryption |
| Architecture changes | ADR-002 (incl. amendment), ADR-006 |
| Dependencies | WP-01 (CI). D-04 hosting region (needed before real data, not before code) |
| Deliverables | Migrations, middleware, harness running in CI, credential service |
| Acceptance criteria | Target-state §A tests 1–4, 7, 8 green; production boot without `ENGAGE_MASTER_KEY` fails; decrypt failure denies |
| Tests | Adversarial isolation suite; credential redaction test; key rotation test |
| Risks | CI Postgres setup friction (mitigate: docker service in GitHub Actions) |
| Priority | P0 |
| Effort | 3 |
| Decision required | D-04 hosting region (by end of W2) |

## Week 3 — 23–29 Nov · Phase 2
| Field | Content |
|---|---|
| Sessions | S7 WP-07 Profiles/identifiers/consents/suppressions · S8 WP-08 Ingestion API · S9 WP-09 CSV import + synthetic tenant generator |
| Objective | Customer data in, correctly identified, consent-aware |
| Product outcome | Two synthetic demo tenants (bookstore, florist) loaded through the same CSV path a real tenant will use at business start |
| Engineering tasks | Tables per target-state §B; normalization (E.164 TR, email); identifier update; `profiles:upsert`, `events:track`, `journeys/{key}/trigger` (stub until WP-16); dedup; monthly partitions + creator job; transactional pg-boss enqueue; CSV import job with evidence columns; synthetic generator writing CSVs (Turkish names, reserved/test phone ranges, `example.*` emails, consent mix, order histories, occasion dates) |
| Architecture changes | ADR-003, ADR-005, ADR-007 |
| Dependencies | WP-04/05. No external dependency; the event spec is ours (Segment-style), published as the onboarding contract |
| Deliverables | API v1 (OpenAPI doc), import job, synthetic generator |
| Acceptance criteria | Duplicate `client_event_id` → one row; one active email per profile enforced by the DB; generator → importer round-trip loads 100k profiles; generator cannot emit a non-test phone or email domain; isolation suite extended to new tables and green |
| Tests | API contract tests; concurrency test on identifier uniqueness; importer error-report test |
| Risks | Synthetic data too clean, hiding real-world mess → generator injects duplicates, bad phones, mixed case, missing consent evidence |
| Priority | P0 |
| Effort | 3 |
| Decision required | — |

## Week 4 — 30 Nov–6 Dec · Phase 2 (exit review)
| Field | Content |
|---|---|
| Sessions | S10 WP-10 Messaging core + mock adapter + DLR simulator · S11 WP-11 Send gate (full rules) + kill switch · S12 **Buffer** + Foundation exit review |
| Objective | A message pipeline that is provably safe before any real channel |
| Product outcome | None visible yet; test-ladder step 1 complete |
| Engineering tasks | Adapter interface + capabilities; `engage.messages`, `message_events`, `send_decisions`; idempotency keys; DLR simulator (delays, failures, duplicates, out-of-order); gate rules incl. quiet hours, frequency caps, budget caps with rate cards (ADR-008), content checks (opt-out text, sender ID 3–11); **sandbox recipient allowlist** (in `sandbox` mode only allow-listed addresses/numbers can receive) |
| Architecture changes | ADR-004 (full), ADR-008 |
| Dependencies | WP-07/08 |
| Deliverables | Gate + ledger + mock channel |
| Acceptance criteria | Adversarial: no consent → deny; revoked mid-journey → deny; sandbox + non-allow-listed recipient → deny; suppressed address under a new profile → deny; `SEND_MODE=off` → 0 adapter calls; duplicate DLR → one status transition; budget exceeded → deny |
| Tests | Gate property tests; replay/duplicate tests; kill-switch timing test |
| Risks | Scope creep in gate rules (keep to the listed rules) |
| Priority | P0 |
| Effort | 2 + 1 buffer |
| Decision required | D-02 commercial model (before WP-11 rate cards) |

## Week 5 — 7–13 Dec · Phase 3
| Field | Content |
|---|---|
| Sessions | S13 WP-12 Email adapter (sandbox ESP, provider-neutral) + signed webhooks · S14 WP-13 Unsubscribe + preference page · S15 WP-14 Templates & personalization rendering |
| Objective | A real channel, under the tenant's identity |
| Product outcome | Demo-tenant emails delivered to Hamza's verified test inboxes (sandbox ESP); a tenant ESP plugs in at business start through the same adapter |
| Engineering tasks | ESP adapter per D-05; webhook signature verification; bounce/complaint → suppression; signed unsubscribe token + RFC 8058 one-click endpoint → consent ledger; Unlayer HTML → engage template with a safe variable subset; preview with sample profile |
| Architecture changes | target-state §E |
| Dependencies | D-05 sandbox ESP in Hamza's/Messign's own account; Hamza's own test domain with SPF/DKIM/DMARC |
| Deliverables | Email channel end-to-end in sandbox |
| Acceptance criteria | Forged webhook rejected; unsubscribe takes effect before the next send; render never calls an LLM; missing variable → deny (not blank send) |
| Tests | Webhook signature tests; unsubscribe E2E; render snapshot tests |
| Risks | Sandbox ESP quirks differ from a tenant's future ESP → adapter interface stays provider-neutral |
| Priority | P0 |
| Effort | 3 |
| Decision required | D-05 ESP |

## Week 6 — 14–20 Dec · Phase 3
| Field | Content |
|---|---|
| Sessions | S16 WP-15 Journey definitions, versioning, approval/activation · S17 WP-16 Executor: triggers, delay, wait-until, exit · S18 WP-17 Branch, re-entry, holdout, message step |
| Objective | A real journey engine |
| Product outcome | Cart-abandonment logic runs end-to-end on the mock channel |
| Engineering tasks | Tables per target-state §D; definition zod schema; approval via the existing approval queue; pg-boss step jobs with `singletonKey`; waiter rows; exit checks by `occurred_at`; holdout assignment at enrollment |
| Architecture changes | ADR-003 |
| Dependencies | WP-10/11 |
| Deliverables | Engine + tests |
| Acceptance criteria | Order after cart → enrollment exits, no message; retry of any step → no duplicate message; re-entry policy enforced; unapproved version cannot activate; 10% ±2% holdout over 10k enrollments |
| Tests | Engine scenario tests (out-of-order events, crash mid-step, job retries) |
| Risks | Engine complexity → scheduled segment trigger lands separately in WP-36 |
| Priority | P0 |
| Effort | 3 |
| Decision required | — (D-11 holdout % confirmed with the tenant at business start) |

## Week 7 — 21–27 Dec · Phase 3
| Field | Content |
|---|---|
| Sessions | S19 WP-18 Cart-abandonment template E2E + simulated load · S20 WP-19 Engage UI shell + profile views · S21 WP-36 Rule-based segments + scheduled segment trigger |
| Objective | First use case working, visible to the tenant |
| Product outcome | Demo-tenant marketer view: customers, consent history, events, messages |
| Engineering tasks | Journey template (delay 1h → message → wait 24h for order → message 2 → exit); event-stream simulator; `client/src/engage` routes; profile list/detail |
| Architecture changes | — |
| Dependencies | WP-12…17 |
| Deliverables | Demo-able sandbox flow |
| Acceptance criteria | Simulated 10k carts → correct enrollments, exits and messages, zero duplicates; UI shows a full audit trail per profile |
| Tests | E2E (Playwright) for login → profile → message trace |
| Risks | Holiday-week capacity → use W10 buffer; drop P1 work first |
| Priority | P0 |
| Effort | 3 |
| Decision required | — |

## Week 8 — 28 Dec–3 Jan · Phase 3
| Field | Content |
|---|---|
| Sessions | S22 WP-20 Journey builder UI (form-based) · S23 WP-21 Analytics: funnel, delivery, holdout uplift · S24 WP-22 Settings: channel accounts, readiness, caps |
| Objective | Tenant can operate it without Hamza editing JSON |
| Product outcome | Configure the journey, see whether it works and what it earns (on simulated conversions) |
| Engineering tasks | Step editor over the definition schema; activation flow with approval; per-step counts; conversion within attribution window vs holdout with a confidence interval; readiness items and `send_enabled` toggle with checks |
| Architecture changes | — |
| Dependencies | WP-18/19 |
| Deliverables | Builder, analytics page, settings |
| Acceptance criteria | Journey created and activated entirely in the UI; analytics numbers reconcile with ledger SQL; `send_enabled` cannot be set without required readiness |
| Tests | UI tests; analytics reconciliation test |
| Risks | UI scope → keep forms minimal |
| Priority | P0 |
| Effort | 3 |
| Decision required | — (D-08 success criteria agreed at business start) |

## Week 9 — 4–10 Jan 2027 · Phase 3 (exit review)
| Field | Content |
|---|---|
| Sessions | S25 WP-23 AI gateway metering + per-tenant cap · S26 WP-24 AI copy drafting for message steps · S27 WP-25 Date-attribute trigger + florist occasion template |
| Objective | AI that saves time under control; the second use case on the same engine |
| Product outcome | Demo bookstore: AI-drafted subject/body in the approval queue. Demo florist: occasion-reminder journey on synthetic order dates |
| Engineering tasks | Telemetry hook for `gateway.ts` and `llmGateway.ts`; cap check; prompt id@version; drafting prompt using brand profile/product truth only; gatekeepers; date trigger with tenant timezone |
| Architecture changes | ADR-009 |
| Dependencies | WP-20; synthetic florist data (WP-09) |
| Deliverables | AI drafting, florist occasion journey |
| Acceptance criteria | A test asserts no profile/identifier fields in prompt payloads; cap reached → AI call denied with message; date trigger fires once per occurrence per profile |
| Tests | Prompt-payload PII test; telemetry rows per call |
| Risks | — |
| Priority | WP-23 P0, WP-24/25 P1 |
| Effort | 3 |
| Decision required | — |

## Week 10 — 11–17 Jan · Phase 4
| Field | Content |
|---|---|
| Sessions | S28 WP-26 İYS client + mock İYS · S29 WP-27 WhatsApp Cloud API adapter (own test number) · S30 **Buffer** |
| Objective | Consent truth from İYS; second channel ready |
| Product outcome | İYS client ready to switch on with the tenant's credentials at business start |
| Engineering tasks | İYS client against official API docs, tested against a **mock İYS server** built from documented request/response shapes (no tenant credentials exist yet); scheduled pull; opt-out push queue; SLA monitor (3 business days, target same day); WhatsApp adapter with template category, webhooks, opt-out on STOP-like replies, using a Meta developer app and test number in Hamza's own account, sending only to his verified numbers **(A, verify Meta's test-number limits)** |
| Architecture changes | — |
| Dependencies | Public İYS API documentation; Hamza's own Meta developer account |
| Deliverables | İYS client + mock İYS, WhatsApp adapter (test number) |
| Acceptance criteria | Opt-out locally → push job enqueued and tracked; İYS revocation → local state revoked before the next send; WhatsApp marketing template blocked without WhatsApp consent |
| Tests | Contract tests against recorded sandbox responses |
| Risks | Mock İYS may drift from real behaviour → live verification is the first onboarding step at business start |
| Priority | P1 |
| Effort | 2 + 1 buffer |
| Decision required | — |

## Week 11 — 18–24 Jan · Phase 4 (exit review)
| Field | Content |
|---|---|
| Sessions | S31 WP-28 Alaris adapter (conditional on docs) · S32 WP-29 Ops & monitoring · S33 WP-30 Sandbox E2E + live technical test (ladder step 4 if eligible) |
| Objective | SMS adapter written against real docs; production-grade observability |
| Product outcome | SMS ready to switch on when başlık/İYS/account land |
| Engineering tasks | Alaris HTTP adapter per docs (DLR, error codes, rate limits **from docs only**), domestic-route capability flag; provider health; alerts on gate-denial spikes, failure rates, DLQ depth; error tracking; backup/restore check; E2E script across ladder steps 1–2, and step 4 **only** if a legitimate account exists that is not a tenant's (e.g. through your own Alaris relationship), with written provider notice, own numbers and technical text only |
| Architecture changes | — |
| Dependencies | **External:** Alaris API docs/sandbox (request now through your Alaris relationship); provider written notice for step 4 |
| Deliverables | Adapter (or buffer), dashboards/alerts, E2E report |
| Acceptance criteria | No guessed provider behaviour (every mapping cites a doc section); alert fires in a drill; restore tested |
| Tests | Adapter contract tests from doc examples |
| Risks | No docs → S31 becomes buffer |
| Priority | WP-28 conditional, WP-29/30 P0 |
| Effort | 3 |
| Decision required | — |

## Week 12 — 25–31 Jan · Phase 5
| Field | Content |
|---|---|
| Sessions | S34 WP-31 Security hardening · S35 WP-32 Performance baseline · S36 WP-35 Erasure + export (KVKK data-subject requests) |
| Objective | Close known holes before real data |
| Product outcome | — |
| Engineering tasks | Remove seed routes from prod; ingestion rate limits per key; hash-chained engage audit; multer upgrade; secrets scan in CI; CSP review; load test: 1M events, 50k enrollments, gate throughput; index tuning |
| Architecture changes | — |
| Dependencies | — |
| Deliverables | Security checklist, perf report with baseline numbers, erasure/export endpoints |
| Acceptance criteria | Checklist items closed or explicitly accepted; ingestion p95 and step latency recorded; erasure leaves pseudonymised ledger rows + suppression hash, and an erased address is never messaged again |
| Tests | Security regression tests; k6/autocannon scripts |
| Risks | — |
| Priority | WP-31 P0, WP-32 P1 |
| Effort | 3 |
| Decision required | D-03 entity path and D-04 hosting region must be decided before business start |

## Week 13 — 1–7 Feb · Phase 5
| Field | Content |
|---|---|
| Sessions | S37 WP-33 Onboarding kit + pilot runbook + kill-switch drill · S38 WP-34 Business-start dry run · S39 Retro + 6-month roadmap |
| Objective | On business start day, the first pilot tenant can go live in ≤ 2 weeks with no engineering on their side |
| Product outcome | A tenant onboarding kit: what they sign, the CSV templates (customers, consents with evidence, orders), DNS records, başlık/İYS documents, plus a demo script on the synthetic tenants |
| Engineering tasks | Runbook (on-call, rollback, key rotation, incidents); kill-switch drill; onboarding checklist mapped 1:1 to `tenant_readiness` items; **dry run:** provision a fresh synthetic tenant from zero using only the kit, run the full journey to allow-listed inboxes, and time it |
| Architecture changes | — |
| Dependencies | None external |
| Deliverables | Onboarding kit, runbook, dry-run report, 6-month roadmap (business-start sequence) |
| Acceptance criteria | Pilot gates 4–8 evidenced on the synthetic tenant; gates 1–3 have a checklist ready for business start; dry run completes in ≤ 1 working day of Hamza's time |
| Tests | Full suite + E2E on the dry-run tenant |
| Risks | Product built without real-user feedback (R21) → keep scope to table stakes; demos to prospects need no action from them (optional, your call) |
| Priority | P0 |
| Effort | 3 |
| Decision required | Business-start sequencing |

---

## External dependencies timeline (v2)

| # | Item | Owner | When | Blocks |
|---|---|---|---|---|
| E1 | Approve strategy package (D-01, revised) | Hamza | ✅ done 2026-11-07 | — |
| E2 | Live DB schema-only dump (`pg_dump -s`); RLS check done 2026-11-07 | Hamza | W1 | WP-03 |
| E3 | Sandbox ESP account + own test domain DNS (D-05) | Hamza | by W5 | WP-12 |
| E4 | Alaris API docs / sandbox through your existing relationship | Hamza | request now, needed W11 | WP-28 |
| E5 | Own Meta developer app + test number | Hamza | by W10 | WP-27 |
| E6 | Messign entity path (D-03) + DPA template **[LC]** | Hamza (+ counsel) | before business start | live pilot |
| E7 | Hosting region decision (D-04) **[LC]** | Hamza (+ counsel) | before business start | real data |
| **At business start (tenant-side, outside the 90 days)** |||||
| B1 | Signed processor agreement (+ cross-border standard contract/notification if applicable) | Tenant + Messign | day 0 | any data transfer |
| B2 | CSV exports: customers, consents with evidence/İYS export, order history | Tenant | week 1 | import |
| B3 | Email: tenant ESP + DNS on a sending subdomain | Tenant | week 1 | email live |
| B4 | SMS: Alaris account in tenant's name, başlık documents, İYS brand code | Tenant / Hamza | weeks 1–4 (başlık approval lead time) | SMS live |
| B5 | İYS API credentials | Tenant | week 1 | İYS sync live |
| B6 | Meta business verification + WABA | Tenant | weeks 1–4 | WhatsApp live |
| B7 | Pilot success criteria + holdout % (D-08, D-11) | Hamza + tenant | week 1 | pilot conversion |
| B8 | Real-time cart events (API) — only when the tenant agrees to integrate; until then, journeys run on imported data (win-back, occasion, new-release) | Tenant | later | real-time cart abandonment |
