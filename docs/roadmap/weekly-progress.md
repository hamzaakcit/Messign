# Weekly Progress

Append one entry per session: date · session · WP · done · remaining · next · blockers. Newest on top.

## 2026-11-07 · WP-04 (Engage schema and tenancy foundation)
- **Done:** migration `111_engage_tenancy.sql` (schema `engage`, `organizations.product`, `tenant_settings`, `tenant_readiness`, `api_keys`, role `messign_engage` without login, FORCE RLS on all three tables). Engage pool and boot check (`engage/db.ts`), `requireEngageUser`, `requireApiKey`, `requirePlatformAdmin`, org provisioning and API key creation under `/api/engage`. Mounts only on surface `engage`/`all` and only if the role cannot bypass RLS. Design deviations are listed in ADR-002 (implementation notes).
- **Verified:** `tsc` clean; 23 unit tests; 13 real-Postgres tests (role boot check, schema guard, cross-tenant read/insert/update/delete, no-context reads, org switching on one connection, API key lookup, auth paths). I broke the migration 6 ways (permissive policy, BYPASSRLS role, open key lookup, missing WITH CHECK, extra grant, missing RLS) and the tests failed each time. A booted server and signed test tokens exercised 21 HTTP cases: two orgs provisioned, wrong or missing org claim rejected, key org taken from the key, revoked key rejected, no key or password in the log. Boot refuses to mount with a superuser role or no URL. CI now runs a Postgres 16 service for the real-Postgres tests.
- **Not done:** `channel_accounts` and envelope encryption (WP-06); the import-lint test and HTTP-level adversarial suite (WP-05, which also covers target-state tests 4 to 8 properly); per-key rate limiting (WP-08); `send_enabled` readiness constraint (WP-11/22). Not tested against a database built from the real legacy schema, because WP-03 (baseline) is blocked on the schema-only dump; the migration only needs `organizations`, `reimbursement_users` and `employee_auth`, which I checked against the repo's definitions. The CI Postgres service is untested until the PR runs. No real engage database role exists yet outside my scratch databases: you need to run `db/scripts/create_engage_role.sql` and set `ENGAGE_DATABASE_URL` per environment.
- **Next:** WP-05 (adversarial harness) then WP-06 (credential store); WP-03 when the dump arrives.

## 2026-11-07 · WP-02 (Repo cleanup + product surface)
- **Done:** removed `knowledge-hub/`, `knowledge-hub.zip/`, all `*.dump`, root ComfyUI/Python scripts and `server/db/` RLS-unblock SQL. `/api/seed` no longer mounts in production. Added `PRODUCT_SURFACE` and `VITE_PRODUCT_SURFACE` (default `workspace`, so current deploys are unchanged). On `engage`: frozen routers, modules and the budget and publisher jobs do not start; frozen nav, command items, mobile tabs and Company-OS widgets are hidden; frozen client paths redirect to `/marketing`. README and CLAUDE.md updated.
- **Verified:** `tsc` clean in both workspaces; server 955 passed / 9 skipped and client 560 passed with Postgres and Redis unreachable. Booted real servers: frozen API routes return 404 on `engage` and 401 on `workspace`; kept routes match on both; an invalid value stops boot. Browser check of the client on `engage` at desktop and mobile widths, using a fake local session.
- **Not done:** `dal/time` kept, because the Executive timesheet feature uses it (see decisions-pending). `organizations.product` is WP-04. BullMQ workers, pg-boss jobs and event subscribers still start on `engage`. Frozen features inside the marketing module (social publishing, competitor intelligence) are not split out. `/api/seed` production behaviour is unit-tested only, not boot-tested. Legacy client code still sends the ignored `X-User-Id` header, so CORS still allows it. A stray `.claude/worktrees/amazing-elion` gitlink remains tracked.
- **Blocker for you:** the repo is public and the removed dumps, which contain table data, remain in git history (see decisions-pending).
- **Next:** WP-03, blocked on the schema-only dump (`pg_dump -s`); otherwise WP-04.

## 2026-11-07 · WP-01 (Safety & CI baseline)
- **Done:** server `tsc` fixed (`gateway.ts:83` — `Anthropic.ContentBlockParam` no longer exported by installed SDK 0.32.1; retyped to `Array<TextBlockParam | ToolUseBlockParam>`, the two block kinds actually pushed). CI (`.github/workflows/ci.yml`) now runs on Node 22 (matches `.nvmrc`) and adds a `npm test` step (root → both workspaces) after type-check. `SEND_MODE` (ADR-004: `off` default/unset/invalid, `sandbox`, `live`) now gates every legacy marketing adapter (email, LinkedIn, X, Instagram, blog webhook) via `isSendModeLive()` in `adapterUtils.ts` — replaces the inconsistent per-adapter flags (`EMAIL_FORCE_REAL`, `X_FORCE_REAL`, `LINKEDIN_FORCE_MOCK`, bare token/webhook presence). `MARKETING_PUBLISHER_ENABLED` cron now defaults OFF (was default-on, opt-out). Removed the `x-user-id` header auth bypass entirely — `requireAuth`, `reimbursementAuth`, `adminAuth` (NODE_ENV-gated, so a non-production env was an open door — R10) and the always-on fallback in `routes/channels.ts` / `routes/chat.ts` (not even NODE_ENV-gated). `db:verify-rls` (`scripts/verifyRls.ts`) rewritten: requires a dedicated `RLS_VERIFY_DATABASE_URL` (never the app's superuser `DATABASE_URL`/`pool`), asserts the connected role has neither `BYPASSRLS` nor `SUPERUSER` before running the RLS check — fails closed with a clear message otherwise (D-07). Also fixed one pre-existing broken test (`marketingContentWorkflow.test.ts` — relied on the default `maxTruthRetries` before commit `d1e2d110` lowered it; made explicit in the test).
- **Verified:** server `tsc --noEmit` clean; server tests 933 passed / 9 skipped; client tests 556 passed, run with Postgres and Redis unreachable to match CI. `sendModeGate.test.ts` covers all 5 adapters. CI went red on the first push (3 tests needed a live Postgres/Redis, the A1 env-dependent failures); those tests now mock the dependency. The first local "green" only held because local Postgres and Redis were running.
- **Not done (explicitly out of scope — later WPs):** the `messign_engage` non-bypass role + pool itself (WP-04); the full send gate with `send_decisions`/consent/suppression (WP-11); `db:diagnose-rls` left as-is (diagnostic tool, not a pass/fail check).
- **Next:** WP-02 (repo cleanup + `PRODUCT_SURFACE` flag + CLAUDE.md refresh + README).

## 2026-11-07 · Founder decisions recorded
- **Approved:** D-01, D-02, D-09, D-10, D-11 (10%), D-12. **Pending:** D-03 (entity), D-04 (hosting). D-05 = sandbox testing only. D-08 = default pilot design added to the roadmap. Kitapyurdu/Lilyana are prospects only.
- **D-07 finding:** the production app connects as `postgres` SUPERUSER/BYPASSRLS, so RLS is ignored at runtime (R1 confirmed). `reimbursement_requests` RLS was enabled on Railway (no runtime effect under superuser). ADR-002 amended: engage gets a dedicated non-bypass role and its own pool. ADRs 001–009 accepted.
- **Still needed:** a schema-only dump (`pg_dump -s`) for WP-03; D-06 clarification (Related Digital).
- **Next:** WP-01.

## 2026-11-07 · Session A2 addendum (founder answers)
- **Answers:** Kitapyurdu has no CEP (greenfield). Neither Kitapyurdu nor Lilyana will take any action until the business officially starts; build on mock data and a test setup. The Alaris platform supports a domestic TR route.
- **Plan changed to v2:** 90-day goal = pilot-ready on business start day (synthetic tenants, allow-listed test recipients only, no real personal data). Added WP-35 (erasure/export, moved out of WP-09), WP-36 (segments + scheduled trigger, P0). WP-09 now includes the synthetic generator. WP-33/34 became onboarding kit + business-start dry run. Tenant-side dependencies moved to a business-start list (B1–B8).
- **Next:** WP-01 after D-01 approval.

## 2026-11-07 · Session A2 (strategy & plan, docs only)
- **Done:** web-verified competitive matrix; strategy answers (product-vision, market-positioning); TR obligations doc; target architecture; ADR-001…009; 90-day roadmap; backlog; decisions-pending; CLAUDE.md pointer.
- **Key findings:** Turkish operators block A2P SMS with links from abroad, so SMS needs a domestic route. Local incumbents (Related Digital, Netmera) already cover İYS, and Netmera offers TR hosting, so compliance is table stakes. Related Digital's references include idefix and D&R, Kitapyurdu's closest competitors.
- **Remaining:** founder decisions D-01…D-12.
- **Next:** WP-01 (Week 1, S1) after D-01 approval.
- **Blockers:** D-07 (live DB dump) for WP-03.

## 2026-11-07 · Session A1 (reconnaissance, read-only)
- **Done:** current-state.md, feature-maturity-matrix.md, risk-register.md, technical-debt.md; master prompt saved to `docs/strategy/master-prompt.md`.
- **Test baseline:** server 906 pass / 3 env-dependent fail / 9 skipped (123 files); client 557 pass (98 files); server `tsc` 1 error (`services/ai/gateway.ts:83`); client `tsc` clean.
- **Next:** Session A2.
