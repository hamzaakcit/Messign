# E2E report: sandbox end to end across the test ladder (WP-30)

**Run:** 2026-11-23, on a scratch PostgreSQL 17 (port 5499, not the repo's `.env` database), commit of the WP-30 branch. **Test:** `server/src/__tests__/engage/engageSandboxE2E.integration.test.ts` (18 checks, about 5 seconds). **Re-run:** `ENGAGE_TEST_ADMIN_URL=postgresql://<user>@localhost:<port>/<scratch db> npm run engage:e2e --workspace=server`; add `ENGAGE_E2E_REPORT=/path/report.json` to save the evidence lines. CI runs it with the rest of `npm test`.

This report says what was exercised, what was not, and where the evidence is weaker than it looks. Nothing here sends a real message and nothing here is a compliance claim.

## 1. The test ladder

| Step (master prompt §2.4) | Status | Evidence / reason |
|---|---|---|
| 1. Mock adapter and delivery-report simulator | **Done, end to end** | The scenario in section 3 runs on the mock email adapter and the simulator (shuffled, duplicated, bounced, forged reports). |
| 2. Twilio test credentials (optional) | **Not built, not needed** | No Twilio adapter exists and none is planned; its purpose (proving the adapter contract is vendor-independent) is served by three providers behind one contract: the mock, SES (WP-12) and the WhatsApp Cloud API (WP-27). Reopen only if a second SMS-style adapter is wanted before Alaris. |
| 3. Alaris documentation or sandbox | **Blocked (WP-28)** | Alaris API documentation has not arrived. Nothing about Alaris is guessed. |
| 4. Live technical test to Hamza's own numbers | **Not eligible for SMS; email and WhatsApp were done earlier** | The roadmap allows step 4 only with a legitimate account that is not a tenant's, written provider notice, own numbers and technical text. For SMS there is no account, no documentation and no notice. For email, one real SES sandbox message was delivered to a verified inbox and reported (WP-12, 2026-11-08). For WhatsApp, a Meta test number was checked live on the production API in sandbox mode (WP-27, WP-40; ADR-023, ADR-025). No live message was sent for WP-30. |
| 5. Kitapyurdu pilot | Not started | Waits for business start and the pilot gate (roadmap). |

## 2. What the scenario is

One synthetic bookstore tenant ("Kitap Evi") and one bystander tenant, on real Postgres through the non-bypass `messign_engage` role and the real HTTP stack (the engage router behind the real JWT middleware). The mock Graph API stands in for Meta and the mock İYS server for İYS; both follow the providers' documentation, not the providers, so they are the same kind of evidence as the WP-26 and WP-27 acceptance tests.

1. **Onboarding through the Settings API.** Turning sending on is refused with reasons (server mode off, no account, no rate card, no budget) and accepted once they exist. Accounts (mock email, WhatsApp, İYS), sender name, rate cards, budget caps and the frequency cap are all set through the API.
2. **Customers.** The synthetic bookstore generator's CSV goes through the real importer (120 rows, ends with exactly the generator's own count; 58 customers with email consent and a valid address), plus eight hand-made customers, one for each way a message may or may not go out.
3. **Templates and a journey that needs approval.** An email template, a WhatsApp template Meta "approved" in the mock, a "WhatsApp, else email" journey; activating before approval is refused (409); the approver is recorded.
4. **First wave through the API trigger.** Each customer is triggered twice with one idempotency key, three executors run at once, then two more passes.
5. **Delivery reports.** Shuffled, 50% duplicated, applied twice, plus a forged one; WhatsApp reports twice.
6. **A campaign in flight while customers stop.** An email campaign to everyone with email consent is queued; then one customer unsubscribes from the link in their queued message (one-click POST), one revokes in İYS (pulled from the mock İYS), then the dispatcher runs. A WhatsApp campaign: one customer replies STOP before dispatch.
7. **Cart abandonment from events.** 90 simulated carts through ingestion with duplicate deliveries, orders that exit the journey, holdout.
8. **Kill switches, timed.** `SEND_MODE=off`, then the tenant's `send_enabled=false` through the Settings API, each flipped in the middle of a running batch; then switched back.
9. **Audit trail.** The trail API for every customer who has a message.
10. **Results vs ledger.** The journey results screen against direct SQL.
11. **Second tenant.** Reads, writes and sends across the tenant line.
12. **Operations.** The ops check after the run; and the two calls the scheduled job makes.

## 3. Pilot gates 4 to 8

| Gate (roadmap) | Evidence from this run | Where else it is covered |
|---|---|---|
| **4. Consent and suppression** | No consent, a customer not on the sandbox allow-list, and a suppressed address were each blocked (`no_consent`, `not_allowlisted`, `suppressed`) and nothing reached a provider. A customer who unsubscribed from the link and one who revoked in İYS after their message was queued were both blocked at dispatch; a GET of the unsubscribe link changed nothing. A WhatsApp STOP blocked that customer's queued message and left their email consent alone; the inbound record holds neither the text nor the number. Campaign audiences hold only customers with granted email consent. | `engageGate`, `engageUnsubscribe`, `engageWhatsapp`, `engageIysSync` integration suites (the adversarial suite). |
| **5. Idempotency** | 8 duplicate triggers answered "duplicate"; 8 customers got 8 messages with 3 concurrent executors and 2 extra passes (2 WhatsApp requests, 3 emails, none sent twice). Delivery reports shuffled and 50% duplicated end as expected; the second pass changed 0 rows and 0 events. Cart events: 27 duplicate deliveries stored once, one idempotency key per sent message, the outcome matches the scenario's own expectation. | `engageMessages`, `engageIngest`, `engageCartAbandonment` (1,000 carts in CI; 10,000 by `ENGAGE_SIM_CARTS`). Not shown here: a crash between "provider accepted" and "recorded" (the adapter contract notes it; only a provider that deduplicates on the key absorbs it). |
| **6. Kill switch, timed** | `SEND_MODE=off` flipped between two messages of a batch: the very next message was held (`send_mode_off`, 0 ms after the flip), 5 more held, 0 adapter calls after the flip. The tenant switch through the Settings API: next message held (`tenant_send_disabled`, 3 to 13 ms), 5 more held, 0 adapter calls, another tenant stayed enabled. Switching back sent the held messages once each. | `engageGate` (3 sent, 17 held). |
| **7. Audit trail** | For 162 customers and 325 messages, the trail shows a decision for every message: 301 handed to a provider after an `allow` decision (each marketing one with the granted consent record in force), 24 blocked with a deny code and reasons. Every message sits on an approved and activated journey version with its approver. Decision rows are append-only for the engage role. | `engageProfileTrail`, `engageJourneys`. |
| **8. Tenant isolation** | A second tenant got 404 or 400 on the first tenant's customer, trail, journey, results, campaign preview, channel account and journey trigger, none echoing data; a forged delivery report was refused; its queries saw 0 foreign rows in 12 tables; the first tenant's allow-list did not carry over; its own sends worked and the first tenant's ledger did not change. | `engageIsolation` (the per-table adversarial suite), `engageTenancy`, `engageTenantGuard`. |

**Timing, read correctly.** The 0 to 13 ms is the time from flipping the switch to the next message being held *when the dispatcher is running*. The bound that matters in production is the one in `target-state.md`: at most one in-flight message plus the dispatcher's tick (one minute). The switch is read again for every message, so a running batch stops at its next message. A one-minute drill on Railway with a real timer remains part of WP-33.

## 4. Other results

- **Results reconcile with the ledger:** the journey results screen and direct SQL agree on enrolments and messages, per status.
- **Operations:** after the run the ops check found no conditions and opened no alerts. The alert drill itself (credentials rejected, failing calls, missing reports, stuck messages, a down webhook) is `engageOps`.
- **Scheduled path:** the two calls the journey job makes (executor tick, then dispatcher) pick up a new API trigger and send it once; with `SEND_MODE` off the dispatcher reads nothing. The pg-boss schedule itself is not exercised by this test; the production check of WP-40 (a campaign sent from the website) exercised it live in sandbox mode.
- **Does the test have teeth?** Breaking the code in eight ways and re-running, six were caught: consent rule skipped (3 checks fail), suppression rule skipped (1), allow-list rule skipped (2), tenant switch ignored (3), both global-switch checks removed (4), duplicate trigger enrols twice (3). Two were not caught, for stated reasons: removing one of the two global-switch checks changes nothing because the other holds (by design, and a third layer holds a failing gate), and removing the tenant scope from the allow-list query changes nothing because forced row-level security scopes it anyway.

## 5. Findings

1. **A campaign counts customers it cannot reach.** In the run, 7 of the 72 customers enrolled by the email campaign have email consent (imported from messy data) but no usable address; the gate blocked each with `no_recipient`, so nothing wrong was sent, but the campaign's "enrolled" and the preview's "with consent" are higher than the number of customers who can receive it. A small follow-up: count only customers with an active address for the template's channel. Not fixed here (one work package).
2. **A revocation made in İYS or in WhatsApp has the customer's own time, not ours.** A message sent after the customer revoked but before we pulled the revocation shows in the trail as sent while a revoked consent was "in force at the time". That is the true timeline, and it is why the İYS pull interval and SLA monitor (WP-26) matter. Both providers stamp whole seconds, so the test lets a second pass between the first wave and the stops; a message sent in the same second as a stop is ambiguous in any system.
3. **The 15-second default timeout was not enough** for the audit walk when the whole suite ran in parallel (one trail request per customer); the file now sets its own timeout.

## 6. What this report does not show

- **Nothing real.** No real provider, no real number, no `live` mode. The mocks follow documentation; the first live check per provider remains the first onboarding step (runbooks). WhatsApp: Meta had not approved the test template `messign_live_check` when WP-40 ended, so the template-approval webhook and header and link-button sends are still unverified live (ADR-025). That needs Hamza at the Meta dashboard; it does not block WP-30.
- **No browser.** The Lucy-page screens were not driven here. The Playwright E2E of WP-19 and WP-20 (`playwright.engage.config.ts`, not in CI) was not run for this report.
- **Not covered by design in this WP:** live-mode rules (they need real accounts), quiet hours and frequency caps beyond the generous cap set here (`engageGate`), erasure and export (WP-35), load (WP-32; the cart simulation has a 10,000-cart mode), SMS (WP-28).
- **One tenant of 128 customers and one of a handful.** Volume is the job of WP-32.

## 7. For Hamza (nothing blocks this WP)

- To get step 4 for WhatsApp to a finish: approve `messign_live_check` at Meta, then run the steps in `docs/runbooks/whatsapp.md` "Live check of templates (WP-40)" and put the result into ADR-025.
- Step 4 for SMS waits for WP-28 (Alaris documentation, an account that is not a tenant's, written notice to the provider).
