# Feature Maturity Matrix

**As of:** 2026-11-07, `main` @ `41320c1`. Session A1, read-only.
**Scale (exactly one per row):** **Real** = works end-to-end, persisted, tested · **Partial** = real backend, incomplete/untested paths · **Simulated** = mocked/hardcoded/fake responses · **UI-only** = screen exists, no meaningful backend · **Dead** = unreachable or unused.
**Engagement relevance:** Core = needed for the Kitapyurdu/Lilyana engagement product · Support = reusable infrastructure · None = Company-OS feature.

Evidence paths are relative to repo root. Test counts are Vitest files unless stated.

---

## A. Engagement-product capabilities (what Insider-class buyers expect)

| Capability | Maturity | Evidence | Relevance | Note |
|---|---|---|---|---|
| Customer profiles (consumer-grade, identifiers, attributes) | **Dead** (does not exist) | no table; closest `crm_contacts` (045), `marketing_leads` (051) | Core | Greenfield |
| Identifier policy (external ID primary, email/phone secondary, inactive history) | **Dead** | — | Core | Greenfield |
| Event ingestion API (server-side, dedup, DLQ) | **Dead** | no route; only internal `eventBus` (mitt) | Core | Greenfield |
| Consent per channel/purpose, suppression, opt-out | **Dead** | grep consent/suppress/opt_out → 0 data columns | Core | Legal surface, greenfield |
| Segmentation / audiences | **Simulated** | `marketing_email_campaigns.audience_filter JSONB` stored, never resolved; `marketing_leads` filters in `dal/marketing/leads.ts` | Core | B2B lead filters only |
| Journey / automation engine (customer-facing) | **Partial** (wrong domain) | `marketing_automations` (093), `services/ai/marketing/automationExecutor.ts`: triggers = internal Company-OS events; actions = `create_content`, `send_notification` | Core | Reusable only as a pattern; no delays/branches/waits/exit rules |
| Email delivery to recipients | **Simulated** | `publishing/adapters/emailAdapter.ts` → single `MARKETING_EMAIL_TEST_TO`; `emailCampaigns.ts#sendEmailCampaign` sets status only | Core | No audience, no per-recipient send, no bounce handling |
| SMS channel | **Dead** | only `channelGenerators/smsGenerator.ts` (copywriting) | Core | Greenfield, gated on Alaris account |
| WhatsApp channel | **Dead** | — | Core | Greenfield |
| Push / web push / RCS | **Dead** | `notification_preferences.push` flag, no sender | None (90d) | Postpone |
| Delivery status / DLR / ESP event ingestion | **Simulated** | `routes/marketing/performanceRoutes.ts#/webhook` behind user JWT, no signature; `webhookParser.ts` | Core | Unreachable by any provider |
| Per-tenant messaging credentials | **Dead** | all adapters read `process.env` | Core | Non-negotiable requirement, greenfield |
| Production send gate / kill switch | **Simulated** | per-adapter env flags with inconsistent polarity (`EMAIL_FORCE_REAL`, `X_FORCE_REAL` opt-in; `LINKEDIN_FORCE_MOCK` opt-out; Instagram real if token) ; publisher cron on by default | Core | Must be redesigned as one gate |
| Frequency capping / quiet hours | **Dead** | — | Core | Greenfield |
| Transactional vs marketing distinction | **Dead** | — | Core | Legal surface (İYS) |
| Campaign analytics per message/step | **Partial** | `performance_feedback` (097), `calibration_snapshots` (109), `marketing_campaigns` aggregate counters | Core | Aggregates only, no per-message events |
| Templates (email) | **Real** | `marketing_email_templates` (098), Unlayer designer, `client/src/pages/marketing/unlayerTemplates` (18-version registry), golden tests `va2GoldenManifestAssembly.test.ts` | Core | Strong asset |
| AI content generation + gatekeepers + approvals | **Real** | `services/ai/marketing/*`, `marketing_approval_queue` (073), 70 marketing test files, `scripts/redTeam` | Core | Strong asset; B2B-tuned prompts |
| Brand profile / product truth / glossary | **Real** | `marketing_truth_*`, `brand_profiles` (099), `marketingContextCompiler.ts` | Core | No RLS on truth tables |
| Lead capture (public form → lead) | **Partial** | `routes/marketing/leads.ts#/capture` behind `reimbursementAuth` → not publicly reachable | Support | B2B shape |
| Landing pages / popups | **Partial** | `marketing_landing_pages` (087), `marketing_popups` (088), routes `pages.ts`, `popups.ts` | None (90d) | No rendering/hosting path found |
| E-commerce connectors (Shopify/Ticimax/ikas/custom) | **Dead** | — | Core | Evaluate what Kitapyurdu/Lilyana run first |

## B. Platform / infrastructure

| Capability | Maturity | Evidence | Relevance |
|---|---|---|---|
| Auth (JWT access/refresh, sessions, blacklist, fingerprint) | **Real** | `routes/auth.ts`, `services/authService.ts`, `middleware/authMiddleware.ts`, `__tests__/middleware/requireAuth.test.ts`, `passwordServiceVerify.test.ts` | Support |
| RBAC | **Partial** | single `role` string; `requireRole()`; module `requiredRoles`; `financeRbac.ts`; no permission model | Support |
| Multi-tenant organizations (provisioning, switching) | **Simulated** | `organizations` table exists; `reimbursementAuth` hard-codes `slug='messign'`; no signup/provisioning | Core |
| RLS tenant isolation | **Partial** (designed, not enforced) | `db/migrations/001–004`, `withTenantQuery` 82 call sites vs ≈667 unscoped queries; 77/120 RLS-table inserts omit `tenant_id`; `server/db/railway-dev-rls-unblock.sql` | Core |
| Audit log (platform) | **Partial** | `platform_audit_log` (067) with RLS, `platform/audit.ts`; no hash chain | Support |
| Audit log (finance, hash-chained) | **Real** | `services/finance/auditService.ts` sha256 chain, `finance_audit_log` | None |
| Encryption at rest helper | **Partial** | `services/crypto` AES-256-GCM; used only for IBAN/SWIFT; plaintext fallback outside prod; fail-open decrypt | Support |
| BullMQ queues/workers (8) | **Real** | `queue/queues.ts`, `queue/workers/*` | Support |
| pg-boss (marketing batch, scrape, snapshots) | **Real** | `services/jobQueue.ts`, `batchService.ts`, `batchService.test.ts` | Support |
| node-cron jobs (3) + setInterval RAG outbox | **Real** | `jobs/*.ts`, `index.ts` | Support |
| In-process event bus (mitt, ≈141 events) | **Partial** | `events/eventBus.ts`; no persistence/retry/multi-instance | Support |
| Outbound org webhooks | **Real** | `services/webhookService.ts`, `webhooks`/`webhook_deliveries` (055), BullMQ `webhooks` worker | Support |
| Socket.io realtime (+ Redis adapter) | **Real** | `sockets/index.ts` (12 handlers), `services/socketIoRedisAdapter.ts` | Support |
| AI gateway: tier cascade (`gateway.ts`) | **Real** | `services/ai/gateway.ts`, LiteLLM config, `__tests__/services/ai` | Support |
| AI gateway: marketing (`llmGateway.ts`) | **Real** | direct Anthropic + Groq | Support (consolidate) |
| AI telemetry / token cost | **Partial** | `ai_request_telemetry` written by Dora chat only; marketing calls uninstrumented | Support |
| HITL pending actions + approvals | **Real** | `services/ai/actions/*`, `pending_actions`, `ai_hitl_idempotency` (068), tests in `__tests__/agents`, `__tests__/modules/ai` | Support |
| RAG (chunking, embeddings, pgvector, outbox) | **Partial** | `services/rag`, `services/ai/rag`, `entity_embeddings` (061), `ragOutbox.ts`; 2 tests | None (90d) |
| Migrations | **Partial** | two dirs (`server/src/migrations` 110 files, `server/src/db/migrations` 24 overlapping), two runners, duplicate numbers 032/100, runtime DDL in `db/initNewTables.ts`, RLS scripts out-of-band | Support |
| CI | **Partial** | type-check only; no tests; deploy hooks on push; server `tsc` currently red (1 error) | Support |
| E2E (Playwright) | **Partial** | 9 specs under `e2e/`, need running stack; not in CI | Support |
| Health endpoints | **Real** | `/health`, `/health/live`, `/health/ready`, `/api/health` | Support |
| File uploads | **Partial** | local disk `UPLOAD_DIR`, auth-gated in prod; Supabase bucket SQL for marketing images | Support |
| Billing (Paddle) | **Dead** (never built) | no dependency/route/table | None (90d) |

## C. Company-OS modules (non-engagement)

| Module | Maturity | Evidence | Relevance |
|---|---|---|---|
| Lucy — content pipeline, Unlayer designer, approvals, batch, repurpose | **Real** | see §A rows; `client/src/pages/marketing` 34K LOC | Core |
| Lucy — social publishing (LinkedIn, X, Instagram, blog) | **Partial** | adapters real but platform-account only; publisher tests `publisherExecution.test.ts` (skipped without DB) | None (90d) |
| Lucy — competitor intelligence (scrape + LLM analysis) | **Partial** | `competitorScraper.ts`, `competitors`/`competitor_events` (100), `CompetitorDashboard.tsx`; pg-boss job | None |
| Lucy — CEO/command-center dashboards | **Partial** | `commandCenterAggregator.ts`, `dashboard_snapshots` (101), `CeoDashboard.tsx` | None |
| Dora v1 agentic loop + v2 brain (planner/classifier/stream) | **Real** | `services/ai/orchestrator`, `services/ai/v2`, `__tests__/services/ai/v2` | Support (as "AI assistant" shell) |
| Dora insights / daily briefing / automation policies | **Partial** | `routes/dora/*`, `dora_insights` (048), `daily_briefings` (057), insight generators | None |
| Finance (Neo): expenses, reimbursements, invoices, budgets, GL, period close, vendors, bank details | **Partial→Real** | `modules/finance` 5K + `services/finance` 5.8K, 2 test files, hash-chained audit | None |
| CRM (Ares): pipelines, deals, contacts, companies, activities, forecast | **Partial** | `modules/crm` 3.3K, 1 test; `dora_score` dead columns | None (data shape not reusable) |
| Support (Luna): tickets, SLA, categories, CSAT | **Partial** | `modules/support` 3.6K, 0 tests | None |
| HR (Asia): employees, departments, recruitment ATS (jobs, candidates, interviews, offers) | **Partial** | `modules/hr` 3.3K, 0 tests | None |
| Executive dashboard / KPIs / cross-module query | **Partial** | `modules/executive`, `dal/executive`, `routes/executive`, 1 dal test | None |
| OKR | **Partial** | `modules/okr`, `okr_*` (046/083), event subscriptions | None |
| Heart (culture pulse, burnout, team health) | **Partial** | `modules/heart`, `heart_*` (058) | None |
| Assets / Contracts | **Partial** | `modules/assets`, `modules/contracts`, 053 | None |
| Knowledge Hub (in-server: docs, collections, AI search) | **Partial** | `routes/knowledge-hub`, `routes/knowledge`, `knowledge_*` tables | None |
| Knowledge Hub (standalone Next.js app `knowledge-hub/` + `knowledge-hub.zip/`) | **Dead** (in this repo) | separate package, Prisma, Supabase; duplicated directory | None |
| Projects / tasks / sprints / bounties / showcase | **Partial** | `routes/projects.ts`, `tasks.ts`, `sprints.ts`, `bounties.ts`, `showcase.ts`; `tasksDb.ts`… | None |
| Gamification: XP, levels, badges, leaderboard, game scores, duels | **Partial** | `routes/badges.ts`, `leaderboard.ts`, `game.ts`, `017_game_scores.sql`, `gamificationWorker.ts` | None |
| Team chat (channels, messages, threads, reactions, Dora-in-chat) | **Real** | `routes/chat.ts` 1.3K, `services/chat` 1.4K, 6 tests, `100_chat_v2.sql` | None |
| Time tracking | **Dead** | `dal/time` 1.5K LOC, no module registration, no routes, no client pages | None |
| Notifications (in-app) | **Real** | `routes/notifications`, `notificationWorker.ts`, `056_notifications_v2.sql` | Support |
| Creative hub (AI images: fal/Replicate/OpenAI/Gemini) | **Real** | `modules/creative`, `publishing/imageService/*` | Support (content layer) |
| Admin panel (employees, roles, security, settings, performance) | **Partial** | `routes/admin` 2.4K, `client/src/admin` | Support |
| Wholesale-SMS team dashboard widgets | **Partial** | `client/src/components/dashboard/WholesaleSMSTeamSection.tsx`, `performance_*` tables | None (A2P business internal) |

---

## Summary counts

- Engagement-core capabilities (section A, 22 rows): **Real 3 · Partial 4 · Simulated 4 · Dead 11**.
- Everything a customer-engagement buyer would pay for — profiles, events, consent, journeys, delivery, DLRs, per-tenant credentials — is **Dead or Simulated**.
- What is **Real and reusable**: auth, AI gateway + HITL, content generation + gatekeepers + approvals, Unlayer email design/templates, BullMQ/pg-boss job plumbing, webhooks, notifications, Socket.io, health/ops scaffolding, test discipline in the marketing module.
