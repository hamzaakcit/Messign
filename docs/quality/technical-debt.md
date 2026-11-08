# Technical Debt

**As of:** 2026-11-07 (Session A1). Only debt that affects the engagement pivot or pilot safety is listed with an action. Everything else is recorded as *tolerate* — we do not rebuild for cleanliness (operating principle 2).

**Action key:** **Fix-in-90d** (on the roadmap) · **Fix-when-touched** (opportunistic) · **Freeze** (no new work, hide behind flag) · **Remove** (delete, low risk) · **Tolerate**.

---

## 1. Data layer

| Item | Evidence | Why it matters | Action |
|---|---|---|---|
| Three tenant keys (`organization_id` 1,128 refs · `tenant_id` 126 · `workspace_id` 51) | `db/migrations/001`, 072/075/078 | RLS policies key on `tenant_id`, code inserts `organization_id`; impossible to reason about isolation | **Fix-in-90d** for engagement tables: one key (ADR). Legacy tables: Tolerate |
| 77 of 120 inserts into RLS tables omit `tenant_id` | `current-state.md §3.2` | Would fail under FORCE RLS; proves RLS isn't live | **Fix-in-90d** only for tables the wedge touches; others **Freeze** |
| 20 tenant-scoped tables without RLS; ≈116 tables without tenant column | migration scan | Isolation gaps; most are Company-OS | **Fix-when-touched**; new tables always RLS |
| Two migration directories + two runners (`db/runMigrations.ts` applies `schema.sql`; `migrations/runner.ts` applies 110 files) | `server/src/db/migrations/` (24 files, overlapping), `server/src/migrations/` | Nobody can reproduce prod schema from repo | **Fix-in-90d**: baseline dump from pilot DB → `000_baseline.sql`, delete `server/src/db/migrations/`, single runner **Done in WP-03 (ADR-010).** |
| Duplicate migration numbers `032_*` and `100_*`; un-numbered files (`add_*.sql`, `finance_v2_sprint*.sql`, `fix_all_missing*.sql`) | `ls server/src/migrations` | Alphabetical ordering is accidental | Covered by baseline above **Done in WP-03.** |
| Runtime DDL at boot (`db/initNewTables.ts`, `actionStore.setupActionSchema`, `ragOutbox.setupRagOutboxSchema`, `fixMissingColumns.ts`, `force-db-fix.ts`) | `index.ts:455–458, 476` | Schema drift per environment; no migration record | **Fix-in-90d**: no runtime DDL for new work; Freeze existing **Frozen in WP-03:** a test blocks new DDL in TypeScript; existing code stays. |
| RLS scripts live outside the runner (`db/migrations/001–004`, `server/db/*.sql` "unblock" scripts) | repo root `db/` | Manual, forgettable, and the unblock scripts invite disabling RLS | **Remove** unblock scripts before pilot; fold RLS into runner |
| Dead columns: `crm_deals.dora_score`, `dora_next_action`; `tokens_used` (finance_v12) | grep: no writers | Misleading; `pipelineTools.ts` reads them | **Remove** when touching CRM; otherwise Tolerate |
| `marketing_email_campaigns` has no tenant column; `marketing_content_calendar` uses `workspace_id`; `marketing_leads` no unique (org,email) | 051, 075 | Wrong foundation for recipients/audiences | **Freeze** (do not reuse for engagement); new tables instead |
| B2B CRM shape (`company_id`, `owner_id`, lead scoring) as the only "people" tables | 045, 051 | Not a consumer profile | **Freeze**; build `profiles` et al. |
| 40 `*Db.ts` files in `server/src/db/` + `dal/` + `modules/*/dal/` — three DAL conventions | tree | Navigation cost | Tolerate; new code uses `modules/<x>/dal` only |
| Committed schema-only pg dumps (`messign_main.dump`, `messign_knowledge.dump`) | root | Clutter, risk of future data dumps | **Remove** |

## 2. Backend / platform

| Item | Evidence | Why it matters | Action |
|---|---|---|---|
| Hard-coded default org `'messign'` in 8 places (`reimbursementAuth`, `requireAuth`, `adminAuth`, `financeRbac`, `budgetAlertJob`, `queryLogger`, `initAuth`, `ai/telemetry/service.ts`) | grep `DEFAULT_ORG_SLUG` / `slug = 'messign'` | Single-tenant app layer | **Fix-in-90d** on the engagement API surface (tenant from JWT/API key only); legacy routes Freeze |
| No organization provisioning / signup / tenant switch | `routes/auth.ts` | Cannot onboard Lilyana as tenant #2 | **Fix-in-90d** (admin-only provisioning is enough for pilot) |
| Four job systems | `index.ts`, `queue/`, `services/jobQueue.ts`, `jobs/` | Duplicate semantics, no shared idempotency | **Fix-in-90d**: ADR picks one for messaging/journeys; others Freeze |
| Two LLM gateways (`gateway.ts` tier cascade, `llmGateway.ts` direct) | `services/ai/` | No single place to meter cost / enforce tenant caps | **Fix-in-90d**: route `llmGateway` callers through `gateway.ts` or add shared telemetry hook; minimal change |
| AI telemetry only on Dora chat path | `routes/knowledge-hub/ai.ts` | Marketing generation cost invisible | **Fix-in-90d** (part of gateway consolidation) |
| mitt event bus used for cross-module side effects with `void (async …)` handlers | `events/eventBus.ts`, `automationListener.ts` | Silent loss | **Freeze** for Company-OS; journeys use persisted events |
| Inconsistent env-flag polarity across adapters (`*_FORCE_REAL` vs `*_FORCE_MOCK` vs token-presence) | `publishing/adapters/*` | Unsafe by default | **Fix-in-90d**: single global send gate; adapters consult it |
| Publisher cron defaults ON (`MARKETING_PUBLISHER_ENABLED !== '0'`) | `jobs/marketingPublisherCron.ts` | Accidental sends | **Fix-in-90d**: default OFF behind the global gate |
| ESP webhook endpoint behind user JWT, no signature | `routes/marketing/performanceRoutes.ts` | Non-functional, spoofable if opened | **Remove** / replace with provider-specific verified endpoints |
| `encrypt()`/`decrypt()` fail-open | `services/crypto` | Unsafe for credentials | **Fix-in-90d**: new credential service; leave IBAN usage as is |
| Dev auth via `x-user-id` header; demo password handling in `authService` | `reimbursementAuth.ts:47`, `authService.ts:154,235` | Env-misconfig = open door | **Fix-in-90d** before pilot (delete header path) |
| `platform_audit_log` not hash-chained; two audit systems (platform vs finance) | 067, `services/finance/auditService.ts` | Send/consent audit needs tamper evidence | **Fix-when-touched**: add chain to the engagement audit stream only |
| Outbound webhooks list `IS NULL OR organization_id` | `routes/webhooks/index.ts` | Cross-org read | **Fix-when-touched** (one line) |
| `/api/seed/*` behind shared secret | `routes/seed.ts` | Seed endpoints in a customer-facing API | **Remove** from production build before pilot |
| `tenantId: 'system'` LLM calls in boot (`index.ts:429`) | competitor scraper | Cost attribution hole | Tolerate (frozen feature) |
| Server `tsc --noEmit` red (`gateway.ts:83` `ContentBlockParam`) | type-check | CI red | **Fix-in-90d** (first session, 1 line or pin `@anthropic-ai/sdk`) |
| Node 22.12 pinned; CI on Node 20; `engines >=20` | `.nvmrc`, `ci.yml` | Different runtime in CI vs dev/prod | **Fix-when-touched**: CI → 22 |
| Heavy/unneeded API deps (`puppeteer`, `pptxgenjs`, `xlsx`, `sharp`, `adm-zip`, `mammoth`, `pdf-parse`) | `server/package.json` | Image size, attack surface, build time (native builds) | Tolerate; revisit when containerising |
| `multer@1.x` deprecated with vulns | install warning | Upload surface | **Fix-when-touched** |
| `express-rate-limit` in-memory (per replica) | `index.ts:228` | Limits don't hold across replicas | Tolerate for pilot (single replica); note in runbook |
| Helmet CSP `'unsafe-inline'`/`'unsafe-eval'` | `index.ts:132` | Required by Unlayer | Tolerate |

## 3. Frontend

| Item | Evidence | Action |
|---|---|---|
| Dual routing (React Router paths + `useUIStore().currentView`) | `ARCHITECTURE.md` "Areas to watch"; `App.tsx` 43 routes | Tolerate; new engagement screens use router paths only |
| 34K-LOC marketing UI tuned to B2B SaaS content marketing (command center, Instagram cockpit, competitor dashboard, CEO dashboard) | `client/src/pages/marketing` | **Freeze** everything except designer, templates, approvals, content detail; hide the rest behind a flag |
| No shared types package; client duplicates DTOs | `client/src/lib/types.ts` et al. | Tolerate; engagement API gets a small shared `types` module |
| `client/vite.config.js` + `.d.ts` committed next to `.ts` | tree | **Remove** generated files |
| Three.js/drei login-page animation in the main bundle | `client/package.json`, `components/login` | Tolerate (lazy-load when touched) |

## 4. Repository hygiene

| Item | Action |
|---|---|
| `knowledge-hub/` (separate Next.js+Prisma+Supabase app) and `knowledge-hub.zip/` (identical copy) | **Remove** from this repo (archive elsewhere) |
| Root scripts: `convert_refs.py`, `fix_and_upload.py`, `generate_dora.py`, `pre_start.sh`, `COMFYUI_AVIF_FIX.txt`, `comfyui_*`, `requirements-*.txt`, `workflow_api.example.json`, `dora_references/` | **Remove** or move to `tools/` |
| `typescript-errors.txt`, `SESSION_TRACKER.md`, `ARCHITECTURAL_AUDIT_REPORT.md`, `docs/CURSOR_SPRINT_*`, `docs/messign-v2/*`, `docs/TECHNICAL_REMEDIATION_REPORT.md` | **Freeze** as history; `docs/architecture/current-state.md` is authoritative |
| `ARCHITECTURE.md` claims RLS "on every table" and middleware `SET LOCAL` — both false | **Fix-when-touched**: replace the multi-tenancy section with a pointer to `current-state.md §3` |
| `README.md` product description ("AI-native Company OS") | Update after A2 positioning is approved |
| No `CLAUDE.md` | Create in A2 with pointers to `docs/strategy/master-prompt.md`, `docs/roadmap/*` |
| Test gaps: Support, HR, Heart, Assets, Contracts, OKR, Executive, gamification = 0–1 test files | Tolerate under Freeze; **engagement modules require adversarial tests before merge** |
| 3 environment-dependent server tests fail without Redis/Postgres (`emailResolveIdempotency`, `emailTemplateTools`) and 3 suites `skipIf(!hasDb/!LIVE)` | **Fix-when-touched**: guard with `skipIf` like the others so CI is deterministic |
