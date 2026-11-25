# Backlog

**Convention:** Work packages (WP) are session-sized and ordered. Status: `todo` · `in-progress` · `done` · `blocked(reason)` · `dropped`. Update this file at the end of every session. Week mapping: `90-day-roadmap.md`. Content studio packages (CS) are a parallel track: `content-studio-90-day.md`. The marketing counter (MC) is a parallel evening track: `marketing-counter-120-day.md`. Default the next session to the Engage WP table unless the founder picks an MC row.

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
| WP-20 | Journey builder UI (form-based) | P0 | W8 | done (sections and panels on the Lucy page; Playwright: create and activate in the UI) | Create + activate fully in UI |
| WP-21 | Analytics: funnel, delivery, conversions vs holdout with CI | P0 | W8 | done (journey results; ADR-014) | Reconciles with ledger SQL |
| WP-37 | One Lucy page for Company-OS and engage: platform org may use engage (product `all`, migration 126, `npm run engage:platform`), `/marketing` chosen by organization, engage tabs, tiles and panels on the Lucy page | P0 | W8 | done (ADR-016; runbook one-lucy-page.md) | A Messign admin sees Lucy and engage on one page; a tenant never sees Lucy |
| WP-38 | One-off campaign: send a template to a segment now (a one-step journey plus a record; consent-only audience, readiness check, idempotent, resumable) and the tenant guard that closes Company-OS routes to tenants | P0 | W8 | done (ADR-017, ADR-018; runbook send-a-campaign.md) | A tenant admin sends one email to a segment from the Lucy page; a tenant token reaches no Company-OS route |
| WP-22 | Settings UI: channel accounts, readiness, quiet hours, caps, send_enabled | P0 | W8 | done (Settings tab for tenant admins; send_enabled refused without readiness, server-enforced; PR stacked on #39) | send_enabled blocked without readiness |
| WP-23 | AI gateway metering for all callers + per-tenant cap | P0 | W9 | done | Telemetry row per call (chat, stream, embedding, image, direct-fetch tool path, failures); per-tenant monthly cap refuses before any provider call (real-Postgres test) |
| WP-24 | AI copy drafting for message steps → gatekeepers → approval queue (no PII) | P1 | W9 | done (ADR-019; API only, no UI yet) | PII-in-prompt test green |
| WP-25 | Date-attribute trigger + florist occasion template (synthetic data) | P1 | W9 | done (ADR-021; API and operator script, no journey form yet) | Fires once per occurrence |
| WP-26 | İYS client from public docs + mock İYS server (pull consents, push opt-outs, SLA monitor); live at business start | P1 | W10 | done against the mock (ADR-022; API and job, no Settings screen; live verification is the first onboarding step) | Revocation honoured before next send (against mock) |
| WP-27 | WhatsApp Cloud API adapter (own Meta dev app + test number) | P1 | W10 | done against the mock (ADR-023; no journey step or Settings screen; live verification with a Meta test number is the first onboarding step) | Marketing template blocked without WhatsApp consent |
| WP-28 | Alaris-based SMS adapter from real docs; domestic-route capability (confirmed available) | cond. | W11 | blocked(E4 docs) | Every mapping cites the docs |
| WP-29 | Ops: provider health, alerts, error tracking, restore test | P0 | W11 | done (ADR-024; runbook ops-monitoring.md; the restore drill ran on a local PostgreSQL, not yet on Railway's backups; the alert webhook and heartbeat URLs are set by the operator) | Drill fires alerts |
| WP-40 | WhatsApp in the platform (plan: `wp-40-whatsapp-plan.md`, ADR-025): 40a templates registered and mirrored from Meta, gate rules, account pacing · 40b journeys, campaigns, segments, consent capture · 40c Settings, ops alerts, live check | P0 | W11 | in-progress (40a, 40b, 40c merged; live check done for listing, sending, delivery reports and a website campaign; template-approval webhook and header/link-button sends still to verify) | A tenant runs a WhatsApp journey and a WhatsApp campaign from the Lucy page; a paused, mismatched or marketing-as-transactional template never reaches Meta |
| WP-30 | Sandbox E2E across test ladder (+ step 4 if eligible) | P0 | W11 | done (`engageSandboxE2E` in CI, `npm run engage:e2e`; report `docs/quality/e2e-report-wp30.md`; step 4 not eligible for SMS, email and WhatsApp were checked live earlier; nothing real sent) | E2E report |
| WP-31 | Security hardening (seed routes, rate limits, engage audit hash chain, deps, CSP, secrets scan) | P0 | W12 | todo | Checklist closed/accepted |
| WP-32 | Performance baseline (1M events, 50k enrollments) | P1 | W12 | todo | Numbers recorded |
| WP-35 | Erasure + export (data-subject requests) | P0 | W12 | todo | Erasure keeps pseudonymised ledger + suppression hash |
| WP-39 | Email domain authentication check: look up SPF, DKIM and DMARC for the domain of the email account's From address (DNS, read-only), show the result in Settings, and set the `email_domain_authenticated` readiness item from the result instead of by hand. Re-check on demand and before live mode | P1 | W11 | done (ADR-020; Settings card; a pass expires after 30 days in live mode; hourly scheduled re-check, migration 132) | A domain with SPF, DKIM and DMARC records marks the item satisfied; a domain missing any of them does not, and the live gate denies. The lookup never sends mail and never logs more than the domain name |
| WP-33 | Onboarding kit (CSV templates, readiness checklist, DPA/DNS/başlık list, demo script) + runbook + kill-switch drill. The checklist includes: sender name set in Settings, and the email account's From name equal to it (the send gate denies a mismatch, `sender_identity_mismatch`) | P0 | W13 | done (kit in `docs/onboarding/` (`onboarding-checklist.md` is compared with `REQUIRED_READINESS` by `engageOnboardingChecklist`; CSV templates run through the real parsers; the checklist walked through the Settings API to a sending tenant); `docs/runbooks/pilot-runbook.md`; `npm run engage:kill-switch-drill` with a scratch-database result in `docs/quality/kill-switch-drill-wp33.md`. **Open for Hamza:** the drill on the real environment (Railway timing, runbook 6) was not run here, so pilot gate 6 is evidenced for the mechanism only) | Checklist maps 1:1 to `tenant_readiness`; a tenant with matching sender and From names sends, one with differing names is denied |
| WP-34 | Business-start dry run: onboard a fresh synthetic tenant from zero using only the kit | P0 | W13 | todo | ≤ 1 working day; gates 4–8 evidenced |

## Content studio track (parallel — do not displace the Engage table)

Detail: `content-studio-90-day.md`. Draft 2026-11-12. CS-D2 and CS-D3 approved 2026-11-12. CS-01 through CS-15 are done. Engage **WP-01** is done. Next Engage session defaults to **WP-02**.

| WP | Title | Pri | Status | Acceptance (short) |
|---|---|---|---|---|
| CS-01 | Offer parent (`content_type=offer`) and child status via `parent_content_id` | P0 | done | Org A cannot read org B’s offer; children list empty |
| CS-02 | One Instagram studio used by pipeline slide-over and command center | P0 | done | Regen + carousel slides on the shared component |
| CS-03 | Lucy IG modal creates offer + IG child and opens the studio | P0 | done | Mocked agent yields a child whose parent is the offer |
| CS-04 | Persist `instagram_format`; first image uses 1:1 or 9:16 | P0 | done | `story` → 9:16, `feed` → 1:1 |
| CS-05 | E-commerce prompt pack (5 book, 5 flower) | P0 | done | Fake discount absent from product truth fails the gate |
| CS-06 | Email child from the offer (Unlayer), opt-out required to approve | P0 | done | Product drop has two children; IG needs no unsubscribe line |
| CS-07 | Recipes: product drop, occasion, cart (no IG). Replace atomization stub | P0 | done | Cart creates zero Instagram rows |
| CS-08 | Approval queue deep-links per child (flip if CS-D2 rejected) | P0 | done | Approving email leaves Instagram in draft |
| CS-09 | Carousel per-slide regen (max 5) and apply caption variant | P1 | done | Regen slide 2 does not replace slide 1 |
| CS-10 | `journey_template_ref` on the email child; no send | P0 | done | PII in the draft prompt fails; no provider call |
| CS-11 | Reel cover + storyboard (blocked if CS-D3 rejected) | P0 | done | Parser returns cover prompt plus 3 shots |
| CS-12 | Schedule IG; test publish respects `SEND_MODE` | P0 | done | Unset send mode does not call Graph |
| CS-13 | Second-tenant brand checklist (Messign + florist) | P1 | done | Florist fixture has no Messign product name |
| CS-14 | Dogfood script + one mocked Playwright path | P1 | done | Top 5 annoyances written for CS-15 |
| CS-15 | Buffer: only the CS-14 list | P0 | done | No new channel |

## Content production track (parallel — offer sheet and Fal stills)

Detail: `content-production-roadmap.md`. Draft 2026-11-13. CP-01 through CP-11 are done. The create form now aims the still: materials lead the scene, and the product name is the title. The next Engage session is **WP-02**.

| WP | Title | Pri | Status | Acceptance (short) |
|---|---|---|---|---|
| CP-01 | Offer sheet parser in `user_brief` | P0 | done | Round-trip; sentence-only brief; phone in audience fails |
| CP-02 | Merchant truth rows (price and place labels, org-scoped picker data) | P0 | done | Org isolation; florist has no Dora |
| CP-03 | Gates before copy and Fal | P0 | done | Missing truth row and invented discount never call the model |
| CP-04 | Scene prompt from the sheet, not the raw brief | P0 | done | Scene names product and place and has no price |
| CP-11 | Fal Pro and Ultra request bodies; store returned prompt and seed | P0 | done | Pro body has no guidance, steps, or negative prompt |
| CP-05 | Feed package checks the prompt Fal returned | P0 | done | Missing place fails the still |
| CP-06 | Carousel roles and per-slide claims | P1 | done | Regen slide 2 leaves slide 1 |
| CP-07 | Story frames and reel shot list; cover still only | P0 | done | Two shots do not save; no video |
| CP-08 | Email from sheet fields | P0 | done | Price comes from the field; cart creates no Instagram row |
| CP-09 | Studio sheet beside the draft | P0 | done | Empty product does not start the pipeline |
| CP-10 | Bookstore feed and florist occasion, including Ultra strength tries | P0 | done | Stored Fal prompt has product and place, not the price |

## Marketing counter (parallel evenings — shop window)

Detail: `marketing-counter-120-day.md`. Started 2026-11-14. MC-01 through MC-06 are done. MC-13 and MC-14 were done by UX-01 (2026-11-24). MC-07…11 and MC-15 moved to the UX track (`docs/ux/ux-roadmap.md`). Remaining here: MC-12, MC-16, MC-17, after UX-06.

| WP | Title | Pri | Status | Acceptance (short) |
|---|---|---|---|---|
| MC-01 | Home is the offer list; Lucy is a closed drawer | P0 | done | `/marketing` shows offers, not the chat |
| MC-02 | New offer is five steps; the create modal is no longer the way in | P0 | done | A product drop with no product does not start |
| MC-03 | Content detail is that offer; score and token leave it | P0 | done | Detail shows the still and the caption |
| MC-04 | Shop-window theme on the home and the offer | P0 | done | No glow, paper planes, or zeroed MQLs on the home |
| MC-05 | Empty, error, and tenant-switch states | P0 | done | Kitapyurdu never shows Dora |
| MC-06 | Picture step keeps look, frame, reference, regenerate | P0 | done | Scene line matches the Fal sentence |
| MC-07 | Journey email readable on the offer | P0 | done (UX-06) | Subject, price, and unsubscribe without Unlayer |
| MC-08 | Looks good marks review and does not schedule or post | P0 | done (UX-06) | Disabled until still and caption exist |
| MC-09 | Pipeline becomes the offer list | P1 | done (UX-04) | `/marketing/content` redirects there |
| MC-10 | Calendar schedules a ready offer and warns about live send | P0 | done (UX-07) | A draft cannot be dropped on a day |
| MC-11 | Shop settings replace the Brands button | P1 | moved → UX-05 | Truth and brand in one place |
| MC-12 | A campaign is a name on a set of offers | P1 | todo | No campaign button on the home |
| MC-13 | Intel, funnel, and leads leave the marketing nav | P1 | done (UX-01: removed, not kept under More) | More shows Intel only |
| MC-14 | Sandbox, command center, creative hub, automation leave the nav | P1 | done (UX-01) | Old links still redirect |
| MC-15 | Shop-window theme on Offers, Calendar, and Shop settings | P1 | moved → UX-03 | Three rooms feel like one product |
| MC-16 | Dogfood one bookstore offer and one florist offer | P0 | todo | Both finish as drafts, Lucy stays closed |
| MC-17 | Cut list from the dogfood | P0 | todo | Unused tabs written down, not deleted |

## Marketing UX track (parallel evenings — replaces MC-07…11, 15)

Detail: `docs/ux/ux-roadmap.md` (principles `docs/ux/design-principles.md`, ADR-026, `docs/ux/target-ia.md`). Takes no Engage session.

| WP | Title | Pri | Status | Acceptance (short) |
|---|---|---|---|---|
| UX-A | Reconnaissance: inventory, control audit, duplication map, copy audit | P0 | done | Four docs in `docs/ux/` |
| UX-01 | Delete and hide: frozen screens, unreachable files, Mock/No-op controls | P0 | done (PR #68) | 0 Mock/No-op on kept screens |
| UX-01b | Lucy composer email-only; engage tab contrast; Phase 2 docs | P1 | done | No frozen-channel templates |
| UX-02 | Help pattern: InfoTip, HelpDrawer, `helpContent.ts` registry, copy moves | P0 | done | No paragraph visible by default; tips ≤ 120 chars |
| UX-03 | Tokens and theme: ban bare `text-app`/`bg-app` in marketing + engage | P0 | done | Class-ban test green; AA on real backgrounds |
| UX-06 | Offer detail: one primary, `⋯` menu, email readable without Unlayer | P0 | done | One filled button; subject/price/unsubscribe shown |
| UX-07 | Calendar takes ready offers; live-publish warning | P0 | done | A draft can't be dropped on a day |
| UX-04 | One offer list (Pipeline = status view) | P1 | done | Old URLs redirect with filter |
| UX-05 | Shop settings page replaces the Brands FAB | P1 | todo | No floating button |
| UX-08 | Leftover duplicates (IG preset, journey-email button, editor wrapper, unused channel forms) | P1 | todo | Duplication groups 3, 7, 9 closed |
| UX-09 | Playwright smoke: every primary action on kept screens | P0 | todo | Runs in CI |

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
| Reel video bytes (keyframes, then image-to-video, then Reels upload) | CS-11 used on real offers and a tenant asks |
| Türkiye-hosted deployment | D-04 outcome / buyer requirement |
| Managed messaging (resale), margin on cost ledger | Product-vision Q6 triggers met |
| Billing (Paddle or local) | Messign entity exists + first paid contract |
| Legacy RLS retrofit / Company-OS cleanup or extraction | Company OS gets a buyer, or frozen code blocks engage |
| Remove dead columns (`dora_score`, `dora_next_action`, `tokens_used`) | When touching CRM/finance |
