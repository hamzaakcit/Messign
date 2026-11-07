# Decisions Pending (founder-owned)

Only decisions that are genuinely Hamza's (product, commercial, legal, irreversible). Technical decisions are taken in ADRs. Mark each item ✅ approved / ❌ rejected / ✏️ changed, with the date.

| ID | Decision | Recommendation | Why | Needed by | Status |
|---|---|---|---|---|---|
| D-01 | Approve the strategy package (**revised after Q-A**): wedge (mid-market TR e-commerce); 90-day goal = pilot-ready on business start day, built on synthetic tenants; flagship journey = cart abandonment on simulated events, with imported-data journeys (segments, occasions) for live start; first channel = email (allow-listed test recipients only); freeze list (ADR-001); "not building" list | **Approve** | Fits the customers' constraint of no action before business start; avoids externally blocked channels | Before W1 | ✅ approved 2026-11-07 |
| D-02 | Messaging commercial model: BYO accounts + cost ledger + budget caps; **no wallet/spread** in 12 months unless the Q6 triggers are met | **Approve** | No entity, no reseller contract, tenant is the sender | W4 (before WP-11) | ✅ approved 2026-11-07 |
| D-03 | Messign legal entity: jurisdiction and timing | Decide the path by W4, formed before the pilot. Jurisdiction is a legal/tax question **[LC]**. Selling to Turkish companies as a KVKK processor and possible İYS intermediary argues for evaluating a Turkish company first | DPA, invoicing and the pilot gate depend on it — likely the true critical path | W4 decide | pending (needed before business start) |
| D-04 | Hosting region for engage personal data | EU region now for development; decide before any real data whether production engage runs in Türkiye **[LC]** | KVKK cross-border transfers need standard contracts + notification within 5 business days; Netmera already offers TR hosting | W2 | pending (needed before real data) |
| D-05 | Pilot ESP | Use Kitapyurdu's existing ESP if it has a transactional/marketing API; else Amazon SES in the tenant's own account (EU region) **(A)** | BYO principle; avoids migrating their sending reputation | W4 | ✏️ 2026-11-07: testing only — Messign-owned sandbox ESP, no tenant connection |
| D-06 | What Kitapyurdu and Lilyana run (platform, backend, current ESP/CEP — e.g. Insider, Related Digital, Netmera?) and who builds their event integration | Ask both this week | Changes ingestion design, connector priority and whether we displace an incumbent | W2 | ✏️ 2026-11-07: answer "Related Digital" — conflicts with earlier "no CEP"; clarify (see below) |
| D-07 | Provide a schema-only dump of the live DB and run `npm run db:verify-rls` / `db:diagnose-rls` against it | Do it before S3 | The repo cannot tell us the real schema or RLS state | W1 | ✏️ 2026-11-07: RLS check run on Railway — see findings below; schema-only dump still needed for WP-03 |
| D-08 | Pilot success criteria and conversion terms with Kitapyurdu (e.g. ≥X% revenue uplift vs holdout over 4 weeks → paid contract) | Agree a number and an LOI before go-live | Turns the pilot into a sale | W8 | ✏️ 2026-11-07: Claude defines default pilot criteria (pilot section in roadmap); Kitapyurdu/Lilyana are prospects, not committed design partners |
| D-09 | Start external processes now: Meta verification (both tenants), Alaris account + API docs + domestic-route confirmation, başlık application, İYS API access | Start all in W1 | Long external lead times; none block code | W1 | ✅ approved 2026-11-07: start everything possible in W1 (Messign-side items; tenant-side items need a tenant) |
| D-10 | Approve removals: `dal/time`, `knowledge-hub/`, `knowledge-hub.zip/`, `*.dump`, root ComfyUI/Python scripts, RLS-unblock SQL, seed routes in prod | **Approve** | Dead code, clutter, safety hazards; all recoverable from git history | W1 | ✅ approved 2026-11-07 |
| D-11 | Holdout group (10% of eligible carts receive no message) acceptable to Kitapyurdu | **Approve 10%** | The only credible way to prove revenue uplift | W6 | ✅ approved 2026-11-07 (10%) |
| D-12 | Lucy Content Studio track paused; spec not executed as written; surviving parts folded into engage (product-vision Q2) | **Approve** | Content layer, not a separate product | W1 | ✅ approved 2026-11-07 |

## Questions that change strategy — answered 2026-11-07
1. Does Kitapyurdu already use a CEP/ESP? → **No. Greenfield, no incumbent to displace.**
2. Will Kitapyurdu's engineering build the event integration? → **No. Kitapyurdu will take no action on their side, not even for testing.** ⚠ Invalidates E7 and the real-time cart-abandonment use case (D-01 must be revised; see open question Q-A).
3. Can the Alaris-based platform terminate SMS on a domestic Turkish route? → **Yes.** Link-bearing SMS is possible.

## Open question raised by answer 2
- **Q-A:** Which *non-engineering* actions will Kitapyurdu allow? → **Answered 2026-11-07: none, from Kitapyurdu or Lilyana, until the business officially starts. Build on mock data and a test setup.**

## Consequences of Q-A (applied to roadmap v2, 2026-11-07)
- **90-day goal changes:** from "Kitapyurdu internal-staff pilot in W13" to **"pilot-ready on business start day"**. The product is proven end-to-end on synthetic tenants and data, with real sends only to Hamza's own allow-listed test inboxes and numbers. Onboarding needs nothing from the tenant except what the law requires.
- **No real customer personal data in any environment** during the 90 days. D-04 (hosting) and D-03 (entity) stay important, but now fall due before business start, not W2/W4.
- **D-01 revised:** cart abandonment stays the flagship journey (strongest demo and ROI story). It runs on simulated events, and the onboarding path for a real tenant is **CSV import first, API second**, so a tenant can go live without building anything.
- **D-05 revised:** ESP for testing = Messign-owned **sandbox** account (e.g. Amazon SES in sandbox mode, which only delivers to verified addresses) **(A)**. A tenant ESP is chosen at business start.
- **Deferred to business start:** D-06, D-08, D-11 and all tenant-side external items (roadmap v2 list B1–B8).
- **D-09 trimmed:** tenant-side processes (Meta verification, başlık, İYS access, Alaris account in Kitapyurdu's name) start at business start. **Alaris API documentation** can be requested now through your existing Alaris relationship. It is the only external input still useful inside 90 days.

## Findings from D-07 (run by Hamza on Railway, 2026-11-07)
- **The production app connects as `postgres` with `rolsuper` and `rolbypassrls` = true.** Every RLS policy is therefore ignored at runtime: the database provides **no tenant isolation today**. This confirms risk R1. The Company OS has one tenant, so nothing has leaked, but no second tenant may ever be put on the legacy schema.
- `reimbursement_requests` had RLS disabled. `npm run db:apply-rls` was run against Railway and it now shows `rowsecurity: true`. Under the superuser connection this has **no runtime effect**. If the legacy app is ever switched to a non-bypass role, the reimbursement inserts that omit `tenant_id` (`expenseService.ts`, `expenses.ts`, `reimbursements.ts`) will fail. Do not switch the legacy role without fixing those first (migration discipline).
- `db:verify-rls` cannot pass while it connects as a bypassing role. It must test through a non-bypass role.
- **Consequence → ADR-002 amended:** engage gets its **own connection pool on a dedicated non-bypass role** (`messign_engage`). Legacy keeps `postgres` until it is retired. Work lands in WP-01 (verify script) and WP-04 (role + pool).

## Open items from WP-02 (2026-11-07)
- **D-10 / `dal/time` not removed:** the approval rested on "no routes, no UI", which is wrong. `routes/executive/index.ts` (timesheet approve/reject) and the client's `TimesheetActions` use it. Removing it means also removing that Executive feature. Your call.
- **Dumps in git history:** `messign_main.dump` and `messign_knowledge.dump` are removed from the tree but remain in history, and they contain table data (86 and 18 `COPY` sections; rows not inspected). Decide whether to purge history and rotate any credentials or hashes they held. Purging rewrites history, so it was not done in WP-02.

## Open clarification
- **D-06:** earlier you said Kitapyurdu has no customer engagement tool, then answered D-06 with "Related Digital". Which is it: does a prospect use Related Digital, or is Related Digital the competitor to beat? It doesn't block Week 1.
