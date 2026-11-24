# Tenant onboarding kit (WP-33)

What a tenant (a Turkish e-commerce shop that sends through Messign Engage) receives and does, from business start to its first real message. The aim in
the roadmap: the first pilot tenant can go live in **two weeks after its paperwork arrives, with no engineering on its side**.

Nothing here is legal advice and nothing here claims that a tenant, or Messign, complies with KVKK, İYS rules, BTK rules or any other law. The
boundary is the one in `docs/compliance/tr-messaging-obligations.md`: Messign builds technical controls; the tenant and Messign's advisers fulfil the
legal and operational obligations. Items that need a lawyer's answer are marked **[LC]**.

## The kit

| Part | File | What it is |
|---|---|---|
| 1 | [`tenant-agreements.md`](tenant-agreements.md) | What the tenant signs or states, and what Messign cannot produce yet |
| 2 | [`csv-import-format.md`](csv-import-format.md) and [`csv-templates/`](csv-templates) | What the tenant exports: customers, consents with evidence, orders |
| 3 | [`dns-and-email.md`](dns-and-email.md) | DNS records, the sending subdomain, the email account |
| 4 | [`sms-baslik-iys.md`](sms-baslik-iys.md) | Başlık and İYS documents (SMS, İYS sync) |
| 5 | [`whatsapp-waba.md`](whatsapp-waba.md) | WhatsApp Business account steps |
| 6 | [`onboarding-checklist.md`](onboarding-checklist.md) | The checklist: 1:1 with the readiness items the send gate enforces; checked by a test |
| 7 | [`demo-script.md`](demo-script.md) | A demo on the synthetic tenants, nothing real sent |
| 8 | [`../runbooks/pilot-runbook.md`](../runbooks/pilot-runbook.md) | For Messign's operator: on-call, rollback, key rotation, incidents, the kill-switch drill |

## Who does what

| Tenant | Messign operator (today: Hamza) |
|---|---|
| Signs the agreements; owns the legal entity, the İYS registration, the başlık, the ESP and WhatsApp accounts | Creates the tenant and its accounts from a terminal (secrets typed at hidden prompts, never in chat), runs the imports, watches the pilot |
| Exports the CSV files; adds the DNS records on the sending subdomain | Checks the files with the dry run; reads the result with the tenant |
| Sets the sender name, rate cards, budget caps and readiness items in Settings; presses **Turn sending on** | Sets `SEND_MODE`; runs the kill-switch drill; keeps the key and alert set-up healthy |

The tenant never needs a database, a server or a terminal.

## Timeline (B1 to B8 in `docs/roadmap/90-day-roadmap.md`)

| When | Tenant | Messign |
|---|---|---|
| Day 0 | B1 agreement signed **[LC]** | Tenant created; admin signs in |
| Week 1 | B2 CSV exports; B3 ESP and DNS; B5 İYS credentials; B7 success criteria and holdout | Sender name, accounts, rate cards, budget caps; import dry run, real import; rehearsal in sandbox to staff |
| Weeks 1 to 4 | B4 SMS: Alaris account and başlık approval (lead time is the operator's); B6 Meta verification and WABA | SMS waits for WP-28; WhatsApp when verified |
| End of week 2 (email) | | Kill-switch drill on the pilot environment; `SEND_MODE=live` there; tenant turns sending on; first message to staff |

The date is set by the slowest paperwork, not by engineering: email is the pilot channel because it needs the least of it.

## Checks that exist today

- The checklist file is compared with the gate by a test (`engageOnboardingChecklist`), so the paperwork list cannot drift from what the gate enforces.
- The CSV templates are run through the real importer by the same test.
- The sender-name rule (matching names send, differing names are denied) is tested on real Postgres through the Settings API
  (`engageSenderName.integration.test.ts`).
- The kill-switch drill has a test (`engageKillSwitchDrill.integration.test.ts`) and a script an operator runs in their own environment.
- The business-start dry run (WP-34) is the proof that this kit is enough: a fresh synthetic tenant, onboarded from zero using only these files.
