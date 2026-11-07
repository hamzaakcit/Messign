# CLAUDE.md

Messign is being re-directed from a Company OS to a customer engagement platform ("Messign Engage") for Turkish e-commerce (design partners: Kitapyurdu, Lilyana).

**Start every session by reading:**
1. `docs/strategy/master-prompt.md` — role, ground truth, operating principles
2. `docs/roadmap/weekly-progress.md` — where we are
3. `docs/roadmap/backlog.md` — next work package

**Reference:** `docs/architecture/current-state.md` · `docs/architecture/target-state.md` · `docs/architecture/decisions/` · `docs/roadmap/90-day-roadmap.md` · `docs/roadmap/decisions-pending.md` · `docs/compliance/tr-messaging-obligations.md` · `docs/quality/*`

**Non-negotiables (short form):** one work package per session; full test suite before claiming done; engagement code under `server/src/engage` + `client/src/engage`, DB access via `withTenantQuery` only; every send goes through the send gate (`SEND_MODE` default off); per-tenant credentials only; no personal data in LLM prompts; no compliance claims; frozen Company-OS modules get no new features.
