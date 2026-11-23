# Part 1: what the tenant signs or states

**Not legal advice. Messign has no legal entity yet (D-03), so nothing on this page can be signed today.** This page lists what the tenant will be asked for
so the conversation can start early; each document is drafted and confirmed by counsel **[LC]**. Messign does not ship legal templates in this repository.

Roles (master prompt 2.3): the **tenant is the sender and the data controller**; **Messign is the software provider and data processor**. Messign never
sends in its own name; the tenant's accounts, sender names and registrations are used.

| # | Document | Who signs | Needed before | Status |
|---|---|---|---|---|
| 1 | **Processor agreement** (veri işleyen sözleşmesi) between tenant and Messign: purposes, data categories, security measures, sub-processors, deletion on exit, audit | Tenant, Messign entity | any customer data is imported (B1; readiness item `dpa_signed`) | **[LC]** Blocked until a Messign entity exists (D-03) or counsel confirms another route |
| 2 | **Sub-processor list**: Railway (hosting), the tenant's ESP (Amazon SES), Meta (WhatsApp Cloud API), İYS, the SMS operator; no personal data goes to AI models (design rule R-5) | Annex to 1 | with 1 | Draft the list from the real deployment; **[LC]** which transfers need a standard contract and notification (D-04) |
| 3 | **Cross-border transfer position**: where the data is hosted (region of the database, email provider, Meta) and the safeguard used | Tenant (controller) with Messign | any real data | **[LC]** Hosting region decision D-04 is open |
| 4 | **Pilot terms**: scope (one journey, one channel, four weeks), success criteria, holdout share, guardrails that stop the pilot, conversion terms | Tenant, Messign | day 0 | Content is in `docs/roadmap/90-day-roadmap.md` "Default pilot design"; the contract wording is **[LC]** |
| 5 | **Consent and message classification**: which messages are commercial (consent needed) and which are transactional. Messign assumes cart abandonment, back-in-stock and occasion reminders are commercial | Tenant decides | first journey | **[LC]** the classification is the tenant's call and counsel's |
| 6 | **Statements the tenant records in Settings** (readiness items): processor agreement signed; for SMS the başlık approval and İYS brand code; for WhatsApp the verified business | Tenant admin | live mode | Recorded as statements with an optional evidence link; Messign does not verify them (`onboarding-checklist.md`) |

## What the tenant provides about its customers

- The consents it holds, **with evidence for every grant** (when, and where the proof lives); not pre-ticked, not a condition of purchase **[LC]**. A grant without a date and an evidence reference is skipped by the import and reported.
- Imported consent is recorded as source `import`. It is not İYS consent. A tenant that sends commercial email or SMS in Türkiye registers in İYS and connects its own İYS access; whether Messign counts as an intermediary when it triggers sends is **[LC]**.
- The tenant's privacy notice and any registry obligations are the tenant's own **[LC]**.

## What Messign provides (technical controls, not a legal conclusion)

Per-tenant isolation in the database, per-tenant encrypted credentials, a send gate that checks consent, suppression, quiet hours, frequency, budget and
sender identity before every message, an append-only decision and consent trail, an instant opt-out, a global and a per-tenant kill switch, and an
ops monitor. Erasure and export are WP-35 and are not built yet; do not promise them in the agreement.
