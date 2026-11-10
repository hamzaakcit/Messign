# CLAUDE.md

Messign is being re-directed from a Company OS to a customer engagement platform ("Messign Engage") for Turkish e-commerce (design partners: Kitapyurdu, Lilyana).

**Start every session by reading:**
1. `docs/strategy/master-prompt.md` — role, ground truth, operating principles
2. `docs/roadmap/weekly-progress.md` — where we are
3. `docs/roadmap/backlog.md` — next work package

**Reference:** `docs/architecture/current-state.md` · `docs/architecture/target-state.md` · `docs/architecture/decisions/` · `docs/roadmap/90-day-roadmap.md` · `docs/roadmap/decisions-pending.md` · `docs/compliance/tr-messaging-obligations.md` · `docs/quality/*`

**Non-negotiables (short form):** one work package per session; full test suite before claiming done; engagement code under `server/src/engage` + `client/src/engage`, DB access via `withTenantQuery` only; every send goes through the send gate (`SEND_MODE` default off); per-tenant credentials only; schema changes only as `server/src/migrations/NNN_name.sql` via `npm run db:migrate` (no new runtime DDL); no personal data in LLM prompts; no compliance claims; frozen Company-OS modules get no new features and stay behind `PRODUCT_SURFACE` (server) and `VITE_PRODUCT_SURFACE` (client); the one exception is the Lucy page (`/marketing`), which hosts the engage sections (ADR-016, `docs/runbooks/one-lucy-page.md`); an engage tenant's token reaches only `/api/auth`, `/api/engage` and `/api/health` (`tenantGuard`, ADR-017), so any new route is closed to tenants by default.
