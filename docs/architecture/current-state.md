# Messign — Architecture: Current State

**Status:** Session A1 reconnaissance, read-only. Facts as of 2026-11-07, `main` @ `41320c1`.
**Method:** direct code inspection, migration parsing, full test run, type-check. No application code was changed.
**Supersedes:** `ARCHITECTURAL_AUDIT_REPORT.md` (root) and the architecture claims in `ARCHITECTURE.md` where they conflict with this document.
**Companion docs:** `docs/quality/feature-maturity-matrix.md`, `docs/quality/risk-register.md`, `docs/quality/technical-debt.md`.

---

## 0. One-paragraph verdict

Messign today is a large, single-company "Company OS" (≈286K lines of TypeScript, ≈207 tables, ≈635 HTTP endpoints, ≈130 AI tools) whose only mature, well-tested product surface is **Lucy: AI content generation + Unlayer email design + approval queue + social publishing**. It has **no customer profile model, no consent/suppression data, no event ingestion, no journey engine, and no real email/SMS/WhatsApp delivery to recipients**. Multi-tenancy exists in migrations and in intent, but the application layer resolves every user into one hard-coded organization (`slug = 'messign'`) and ~64% of inserts into RLS tables omit the `tenant_id` the policies require — so tenant isolation is **not** enforced in practice. The engagement product has to be built; the content layer, auth, AI gateway and test discipline can be reused.

---

## 1. Stack (verified)

| Layer | Verified reality | Hypothesis in master-prompt §2.5 |
|---|---|---|
| Frontend | React 18.3, Vite 5, TypeScript 5.3, Tailwind 3.4, Zustand 4.5, React Router 6, TanStack Query/Table, Recharts/D3, TipTap, Unlayer (`react-email-editor`), Three.js (login page). Vercel (`vercel.json`, `client/.env.production` points at Railway API). | ✅ confirmed; Tailwind + Zustand **confirmed** |
| Backend | Node **22.12** per `.nvmrc` (CI uses Node 20, `engines >=20`), Express 4, TS, ESM. Railway (`railway.json`). | ⚠️ Node 20 claim partly wrong — repo pins 22.x |
| DB | PostgreSQL via raw `pg` (no ORM). Neon/Supabase/Railway/PgBouncer all referenced in `server/src/db/index.ts`. `pgvector` for embeddings, Apache AGE migration present (`062_apache_age.sql`). | ✅ confirmed |
| Realtime | Socket.io 4 with optional Redis adapter (`services/socketIoRedisAdapter.ts`), websocket-only by default. 12 socket handlers. | ✅ |
| Jobs | **Four** mechanisms coexist: BullMQ (8 queues/workers, Redis), pg-boss v12 (4 job names: batch-generate, competitor-scrape, dashboard-snapshot, calibration-snapshot), node-cron (budget alerts, marketing publisher every minute, calibration weekly), `setInterval` (RAG outbox every 20s). | ✅ "BullMQ and pg-boss both present" confirmed; plus two more |
| Event bus | `mitt` in-process (`server/src/events/eventBus.ts`), ≈141 typed event names, synchronous fire-and-forget, no persistence, no retry, single-instance only. | ✅ confirmed |
| AI | **Two gateways**: `services/ai/gateway.ts` (tier cascade fast/balanced/complex/frontier/vision through LiteLLM or direct Groq/Gemini/OpenAI/Anthropic) and `services/ai/llmGateway.ts` (direct Anthropic + Groq for marketing agents). `litellm/config.yaml`: fast=Groq Llama 3.3 70B, balanced=Gemini 2.0 Flash, complex=Claude Sonnet 4, frontier=Claude Opus 4, embeddings=OpenAI. Image gen: fal.ai, Replicate, OpenAI, Gemini/Vertex. | ✅ "LiteLLM-style, Groq primary" confirmed, but two parallel gateways |
| Billing | **No Paddle code in the repo** (no dependency, no route, no table). Only "Paddle" references are in docs. | ❌ refuted — Paddle is a plan, not code |
| Tests | Vitest: **123 server test files / 918 tests** (906 pass, 3 fail only because no Redis/Postgres in sandbox, 9 skipped); **98 client files / 557 tests** (all pass). Playwright: 9 e2e specs (need a running stack). | ✅ "120+ Vitest files" confirmed; earlier "~622 server / ~207 client" counts are stale |
| CI | `.github/workflows/ci.yml` runs **type-check only**; **no tests in CI**. `deploy.yml` triggers Vercel/Railway hooks on every push to `main`. Server `tsc --noEmit` currently **fails** with 1 error (`services/ai/gateway.ts:83`, `ContentBlockParam` not exported by installed `@anthropic-ai/sdk`) — introduced by the last commit. | new finding |

---

## 2. Repository layout (what actually matters)

```
server/src/
  index.ts            bootstrap: helmet, CORS, rate limits, 40+ routers, module registry, workers, pg-boss, crons
  modules/            13 PlatformModules (crm, support, finance, hr, marketing, creative, marketing_automation,
                      knowledge, okr, heart, executive, assets, contracts). `time` is NOT registered.
  routes/             legacy routers (chat 1.3K LOC, projects, bounties, game, admin 2.4K, marketing 3.8K, knowledge-hub 2.2K, dora)
  dal/                raw-SQL data access (marketing 4.6K LOC, time 1.5K, assets, executive, contracts, reports, heart)
  services/ai/        28K LOC — tools (8.2K), marketing agents (4.5K), Dora v2 (2.2K), HITL actions (2.1K), orchestrator, RAG
  services/marketing/ 14.8K LOC — publisher, batch, channel generators, competitor intel, context compiler, image pipeline
  services/finance/   5.8K LOC
  migrations/         110 SQL files (numbered 001–109 with gaps + 20 un-numbered), runner = migrations/runner.ts
  db/                 pool + 40 "xDb.ts" query files + schema.sql (695 lines) + a SECOND migrations dir (24 files, overlapping)
client/src/
  pages/              213 TSX pages; marketing alone = 34K LOC (Unlayer designer, Lucy, command center, approvals,
                      Instagram cockpit, competitor dashboard, CEO dashboard); finance 9K; support 3K; crm 1.4K
  lib/                25 *Api.ts modules;  stores/ 16 Zustand stores;  App.tsx 43 routes
db/migrations/        4 RLS scripts (001 add tenant_id, 002 enable+force RLS, 003 force, 004 gap fix) — run manually, out of band
knowledge-hub/        separate Next.js + Prisma + Supabase app, duplicated verbatim in knowledge-hub.zip/ (a directory)
```

Root clutter: `messign_main.dump`, `messign_knowledge.dump` (schema-only pg dumps), ComfyUI/Python scripts, `typescript-errors.txt`, `SESSION_TRACKER.md`, `ARCHITECTURAL_AUDIT_REPORT.md`.

---

## 3. Multi-tenancy and RLS (the most important finding)

### 3.1 What the migrations say
- Tenant key is **three names**: `organization_id` (1,128 code references, dominant), `tenant_id` (added by `db/migrations/001` + `004` and used by RLS policies from `002`; 126 refs), `workspace_id` (8 marketing tables from migrations 072/075/078; 51 refs).
- `002_enable_rls.sql` enables **and forces** RLS on 40 tables with policies `tenant_id = current_tenant_id()`; `004_rls_gap_fix.sql` adds `tenant_id` + RLS to 18 more; later numbered migrations add RLS directly on 15 further tables (e.g. `marketing_automations`, `platform_audit_log`, `batch_jobs`, `brand_profiles`).
- Table inventory from parsing all migrations: **≈207 tables**; **91 carry `organization_id`/`tenant_id`**; **71 of those appear in some RLS statement**; **20 tenant-scoped tables have no RLS at all** (`marketing_approval_queue`, `marketing_email_templates`, `marketing_landing_pages`, `marketing_popups`, `marketing_documents`, `marketing_truth_*`, `marketing_brand_*`, `pending_actions`, `ai_request_telemetry`, `ai_hitl_idempotency`, `rag_outbox_events`, `crm_org_forecast_settings`, …); **≈116 tables have no tenant column** (many are child tables, but also `knowledge_documents`, `messages`, `channels`, `projects`, `tasks`, `notifications`, `marketing_email_campaigns`, `marketing_content_calendar`→workspace_id, `organizations`).

### 3.2 What the code does
- `withTenantQuery(tenantId, fn)` in `server/src/db/index.ts` sets `app.current_tenant` transaction-locally. It is used in **67 files / 82 call sites**. Plain `pool.query` / `query()` without tenant context appears **≈667 times** in dal/routes/services/modules.
- `tenantContext.ts` middleware only copies `req.organizationId` → `req.tenantId`; it does **not** set anything on a DB connection (the ARCHITECTURE.md sequence diagram is wrong).
- **`reimbursementAuth` (used by 90 route files — every module router) hard-codes the tenant to `organizations.slug = 'messign'`** (`DEFAULT_ORG_SLUG`). `requireAuth` derives org from JWT/user row but also falls back to `'messign'` then to "first organizations row". `adminAuth`, `financeRbac`, `budgetAlertJob`, `queryLogger`, `initAuth` all hard-code `'messign'`.
- There is **no signup / organization provisioning path**: `routes/auth.ts` exposes login, refresh, logout, me, sessions only; the only `INSERT INTO organizations` is `services/initAuth.ts` (bootstraps the default org).
- **77 of 120 `INSERT INTO <tenant_id-RLS table>` statements omit `tenant_id`** (e.g. `modules/crm/dal/contacts.ts`, `deals.ts`, `dal/marketing/content.ts`, `campaigns.ts`, `leads.ts`, `okrs.ts`, `tickets.ts`, `reimbursement_users`…). Under the designed schema (`tenant_id NOT NULL` + `FORCE RLS` + INSERT policy `WITH CHECK (tenant_id = current_tenant_id())`) these inserts **cannot succeed**. There is no trigger backfilling `tenant_id` from `organization_id`.
- `server/db/railway-dev-rls-unblock.sql` and `rls-optional-dev.sql` exist to *disable RLS* or grant `BYPASSRLS` when "RLS blocks app inserts".

### 3.3 Conclusion
Either the `db/migrations/001–004` scripts are not applied to the running databases, or the app connects with a bypassing role. **Tenant isolation must be treated as not enforced.** Verifying the live DB state (`npm run db:verify-rls`, `db:diagnose-rls`) against Railway/Neon is an external action for Hamza — the repo cannot tell us. For the engagement product this means: tenant boundaries (including per-tenant credentials) are greenfield work, not an inherited asset. The *mechanism* (`withTenantQuery`, `current_tenant_id()`, FORCE RLS pattern, `messign_app` role script) is sound and worth keeping as the standard.

---

## 4. Authentication and RBAC

- JWT access + refresh (httpOnly cookie), bcrypt, session table, Redis-based session blacklist, optional session fingerprinting (`SESSION_FINGERPRINT_STRICT`). `express-rate-limit`: 100 req/min on `/api`, 10 login attempts / 15 min, 10 AI calls/min on `/api/dora`.
- Roles: a single `role` string on `reimbursement_users` (`admin`, `manager`, `employee`, …) enforced by `requireRole()`; module-level `requiredRoles` arrays; finance has its own `financeRbac`. No permissions table; no per-tenant roles; no API keys / service accounts for server-to-server ingestion.
- Dev conveniences that must not reach a customer-facing deployment: `x-user-id` header auth when `NODE_ENV !== 'production'`; demo password `test123` accepted case-insensitively in non-prod; fingerprint relaxed for private hosts.
- Helmet CSP allows `'unsafe-inline'`/`'unsafe-eval'` (Unlayer requirement).

---

## 5. Send paths — every code path that can reach an external recipient

| # | Path | Trigger | Consent | Suppression | Tenant creds | Idempotency | Prod gate | Reality |
|---|---|---|---|---|---|---|---|---|
| 1 | `services/marketing/publishing/adapters/emailAdapter.ts` | publisher cron (every minute, **on by default**) picks `marketing_content_calendar` rows with `channel='email'` | ❌ | ❌ | ❌ platform env `RESEND_API_KEY`/`SENDGRID_API_KEY`, `MARKETING_EMAIL_FROM` | row claim via `FOR UPDATE SKIP LOCKED`; retry ×3 | `EMAIL_FORCE_REAL=1` else mock | Sends **one email to `MARKETING_EMAIL_TEST_TO`**. No audience, no recipients. **Simulated** |
| 2 | `POST /api/marketing/emails/:id/send` → `dal/marketing/emailCampaigns.ts#sendEmailCampaign` | UI "Send" | ❌ | ❌ | n/a | ❌ | ❌ | Sets `status='sent'`, `delivered = recipient_count`, emits `marketing.email.sent`. **Sends nothing. Simulated** |
| 3 | `linkedinAdapter.ts` | publisher cron | n/a (social) | n/a | ❌ platform `LINKEDIN_ACCESS_TOKEN` | retry ×3 | real **if token present** (opt-out `LINKEDIN_FORCE_MOCK`) | Real API call, platform account |
| 4 | `xAdapter.ts` | publisher cron | n/a | n/a | ❌ platform bearer | retry | `X_FORCE_REAL=1` | Real if forced |
| 5 | `instagramAdapter.ts` | publisher cron / Instagram cockpit | n/a | n/a | ❌ platform `META_GRAPH_ACCESS_TOKEN` | retry | real if token present | Real Graph API container flow |
| 6 | `blogAdapter.ts` | publisher cron | n/a | n/a | platform webhook URL/secret | retry | — | Posts to Knowledge Hub / CMS webhook |
| 7 | `services/webhookService.ts` (outbound org webhooks) | event subscribers → BullMQ `webhooks` queue | n/a | n/a | per-org URL + secret in `webhooks` table | BullMQ attempts | — | Real; admin-only CRUD; list query `($1::uuid IS NULL OR organization_id = $1)` returns all orgs when org is null |
| 8 | Automations (`marketing_automations.actions`) | internal events (`crm.deal.closed`, `project.task.completed`…) | — | — | — | BullMQ `jobId` dedupe | — | Actions supported: `create_content`, `send_notification` (in-app). **Cannot message customers** |
| — | SMS / WhatsApp / push | — | — | — | — | — | — | **Do not exist.** `channelGenerators/smsGenerator.ts` only *writes* SMS copy. `notification_preferences.email/push` flags have no sender behind them. No auth e-mails (invite/reset) either. |

Inbound: `POST /api/marketing/performance/webhook` parses SendGrid/Mailchimp/Postmark events but sits behind **user JWT auth** and has **no signature verification** — unreachable by a real ESP. No DLR/status ingestion of any kind.

**A3 answer: no send path checks suppression or consent, because no consent/suppression data exists** (only aggregate `unsubscribed INTEGER` on `marketing_email_campaigns` and `unsubscribe_rate` in `performance_feedback`).

---

## 6. Customer data

- There is **no customer/profile model**. People-shaped tables are B2B sales artefacts: `crm_contacts` (first/last name, email, phone, company_id, owner_id, tags, notes), `crm_companies`, `marketing_leads` (email, UTM, score, status, `crm_contact_id`), `support_tickets`.
- No identifiers table, no inactive identifiers, no external/CRM ID policy, no attributes JSON, no customer **events** table, no consent per channel/purpose, no suppression list, no deletion/erasure path, no import/export for customer data. `marketing_leads` has no unique constraint on `(organization_id, email)` in migration 051.
- `marketing_email_campaigns.audience_filter JSONB` and `recipient_count` are stored but never resolved into recipients.
- Confirmed hypothesis: **no `customer_profiles` table**; CRM tables are the closest thing — but they are the wrong shape for a consumer engagement product (B2B contact ≠ e-commerce customer).

---

## 7. Lucy / marketing content layer (the real asset)

- **Content pipeline**: `services/ai/marketing/*` — Claude-based orchestrator/strategist (`llmGateway` complex tier), Groq gatekeepers (`productTruthValidator`, `brandVoiceChecker`, `complianceScanner`), `marketingContextCompiler` (brand profile, product truth, glossary, golden examples), approval queue (`marketing_approval_queue`, `MarketingApprovalQueuePage.tsx`), repurpose into channel variants, batch generation on pg-boss, calibration snapshots from performance feedback.
- **Email design**: Visual Architect v2 design-manifest → Unlayer assembly (`client/src/pages/marketing/unlayerTemplates`, 18-version starter registry, golden-manifest tests), fal.ai/OpenAI/Gemini image resolve with Redis idempotency, saved templates (`marketing_email_templates`). Documented in `docs/va2…va13`.
- **Tests**: 70 of 123 server test files are marketing; red-team scripts for gatekeepers (`scripts/redTeam`). This is the only module with an adversarial bar.
- **A1 answer**: there is **no multi-candidate creative-director step**. One draft per channel; `repurposeService` creates per-channel *variants* of one piece, which is not the same thing.
- **A10 answer**: the event bus is **not** reliable for cross-module delivery — in-process `mitt`, synchronous `emit`, handlers wrapped in `void (async…)`, errors swallowed, nothing persisted, lost on restart or on a second replica. Reliability exists only where a subscriber immediately enqueues to BullMQ (`crossModuleQueue` with `jobId` dedupe) or where the RAG outbox table is used.
- Not in the repo: the 14-part Lucy Content Studio spec (Parts 00–13) and the Session 0 A1–A10 list. `docs/va2…va13` are "Visual Architect v2" phases, not the Content Studio spec. A2 and A4–A9 cannot be evaluated here (text not available).

---

## 8. AI layer (Dora)

- Dora v2 (`services/ai/v2`, 2.2K LOC: classifier, planner, context, stream, gateway) behind `DORA_V2_ENABLED` (server, default **on**) and `VITE_DORA_V2` (client, build-time). v1 agentic loop (`orchestrator/agenticLoop.ts`) and legacy intent router still present. ✅ hypothesis confirmed.
- Tool registry ≈130 tools (86 module tools + ~48 core), RBAC per tool, lazy loading via search index. HITL: `pending_actions` + `ai_hitl_idempotency` + `actions/actionInterceptor.ts`/`actionExecutor.ts` + `/api/ai/actions` + Dora approvals route — real, with tests (`__tests__/agents`, `__tests__/modules/ai`).
- Cost instrumentation: `ai_request_telemetry.tokens_input/tokens_output` written only by the Dora chat path (`routes/knowledge-hub/ai.ts`). Marketing LLM calls through `llmGateway.ts` and `gateway.ts` have **no per-call persistence**. `tokens_used` exists only on the finance `finance_dora_decisions`-era schema (`finance_v12_schema.sql:370`) with no writer. ✅ "tokens_used not instrumented" confirmed.
- `dora_score` / `dora_next_action` on `crm_deals`: read by `pipelineTools.ts`, **never written**. ✅ confirmed.
- Prompt versioning: none (prompts are TS string constants). Evaluation harness: prompt substring tests + red-team canned responses only.

---

## 9. Non-engagement modules (summary; details in maturity matrix)

| Module | Server LOC | Client LOC | Tests | Verdict |
|---|---|---|---|---|
| Finance (Neo) | 5.0K module + 5.8K services | 9.1K | 2 server files | Real/Partial; own audit hash chain (`finance_audit_log`), budgets, invoices, reimbursements, GL |
| Support (Luna) | 3.6K | 3.1K | 0 | Partial, untested |
| CRM (Ares) | 3.3K | 1.4K | 1 | Partial; `dora_score` dead columns |
| HR/Recruitment (Asia) | 3.3K | 2.6K | 0 | Partial, untested |
| Executive / CEO dashboard | 0.5K + 0.9K dal | 2.1K | 1 dal test | Real-ish aggregation; ✅ "fully built executive module" confirmed |
| OKR | 0.3K | 0.8K | 0 | Partial; subscribes to `crm.deal.won`, `project.task.completed`, `finance.invoice.paid` ✅ |
| Heart (culture pulse) | 0.4K + 0.5K dal | 0.5K | 0 | Partial |
| Assets / Contracts | 0.25K + 1.0K dal / 0.3K + 0.8K dal | 0.3K / 0.3K | 0 | Partial |
| Knowledge Hub (in-server) | 0.07K module + 2.2K routes + RAG 1.2K | 1.9K | 2 | Partial; plus a *separate* Next.js app at `knowledge-hub/` |
| Time tracking | 1.5K dal only | 0 | 0 | **Dead** — not registered as a module, no routes, no UI |
| Gamification / Merit (XP, badges, bounties, game, leaderboard, sprints, showcase) | ~1.5K routes | sizeable | 0 | Partial, Company-OS-only |
| Team chat (`routes/chat.ts` 1.3K, channels, messages, duels) | 1.5K + 1.4K services | 0.1K pages + components | 6 | Real, Company-OS-only |
| Creative hub (image gen) | 0.09K module + image services | module | several | Real (fal/Replicate/OpenAI), platform keys |
| Marketing automation module | 78 LOC (health endpoint) + 0.4K DAL/executor | — | 1 | Partial; internal-event → draft content only |

---

## 10. Security posture (repo-level)

Good: helmet, CORS allowlist, rate limiting, bcrypt, JWT rotation + blacklist, parameterised SQL throughout (no string-built SQL found in the sampled DALs), `encrypt()` AES-256-GCM helper, no secrets committed (scan clean; `.env*` ignored; dumps are schema-only), uploads behind auth in production.

Gaps: tenant isolation (§3); platform-wide third-party credentials in env (email/LinkedIn/Meta/X/fal/OpenAI…); `encrypt()`/`decrypt()` silently fall back to plaintext without `ENCRYPTION_KEY` outside production and `decrypt()` returns ciphertext on failure (fail-open); no inbound webhook signature verification anywhere; `platform_audit_log` is **not** hash-chained (only `finance_audit_log` is) — hypothesis "hash-chained audit logs" is **finance-only**; `/api/seed/*` protected only by a shared `SEED_SECRET`; outbound webhook list leaks across orgs when `organizationId` is null; CSP `unsafe-eval`; no tests in CI; deploy on every push to `main`.

---

## 11. Hypothesis scorecard (master-prompt §2.5 and A1–A10)

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Stack React18/Vite/TS/Vercel; Node20/Express/pg/Railway; Socket.io; BullMQ+pg-boss; LiteLLM-style; Paddle | **Mostly confirmed**; Node is 22.x; **Paddle refuted** (no code) | `package.json`, `.nvmrc`, grep |
| Tailwind/Zustand | **Confirmed** | `client/package.json` |
| ESM; `organization_id` tenant key; RLS via `current_setting('app.current_tenant')`; RBAC; hash-chained audit; EUR conversion; HITL | ESM ✅; `organization_id` dominant but **three keys coexist**; RLS mechanism ✅ **but not enforced in practice**; RBAC ✅ (role string); hash chain **finance only**; EUR ✅ (`exchange_rates`, `*_eur` columns); HITL ✅ | §3, §4, §10 |
| No `customer_profiles`; CRM tables serve | **Confirmed** | §6 |
| Email-only send adapter; no SMS/WhatsApp hub | **Confirmed, and worse**: email adapter sends to one test address | §5 |
| `dora_score`/`dora_next_action` no writers; `tokens_used` not instrumented | **Confirmed** | §8 |
| Executive module exists; OKR subscribes to key events | **Confirmed** | `modules/executive`, `modules/okr/events/subscribers.ts` |
| 120+ Vitest files; adversarial infra; ~622 server / ~207 client tests | 221 files ✅; red-team scripts ✅ (marketing only); counts stale: **918 server / 557 client** | test run |
| Dora v2 behind `DORA_V2_ENABLED` / `VITE_DORA_V2` | **Confirmed** | §8 |
| Module list | **Confirmed**, plus creative, assets, contracts, heart, marketing_automation; `time` dead | §9 |
| Lucy Content Studio 14-part spec + Session 0 A1–A10 in repo | **Refuted — not in repo** | `grep -ri "content studio" .` → 0 hits |
| A1 multi-candidate creative director | **Refuted** | §7 |
| A3 any send path checks suppression | **Refuted — none, no data model** | §5 |
| A10 event bus reliable cross-module | **Refuted** | §7 |
| A2, A4–A9 | **Cannot evaluate** — assumption text not available | — |
| Earlier Wave-1 order (LLM instrumentation → suppression gate) | Still valid as a *dependency*, but both are now subsumed by the messaging-layer work; not a standalone wave | — |
