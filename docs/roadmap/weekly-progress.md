# Weekly Progress

Append one entry per session: date · session · WP · done · remaining · next · blockers. Newest on top.

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
