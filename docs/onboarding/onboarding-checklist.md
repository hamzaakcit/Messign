# Onboarding checklist (WP-33)

One checklist per tenant, mapped **1:1 to what the send gate enforces**. The two machine-checked tables below are compared with the code by a test
(`engageOnboardingChecklist.test.ts`): a readiness item added to or removed from `REQUIRED_READINESS` (`server/src/engage/messaging/gate.ts`) without
this file changing fails CI, and so does a setup problem the Settings screen can report that this file does not mention.

This is a technical checklist. It does not say that a tenant meets any law or regulation. Everything marked **[LC]** needs legal confirmation by the
tenant's and Messign's advisers before the first real customer message. Messign records what a tenant states (a readiness item is a statement with an
optional evidence link); the one exception, `email_domain_authenticated`, comes from a DNS check.

How to read "Who": the **tenant** is the sender and the data controller; **Messign** is the software and processor (`docs/compliance/tr-messaging-obligations.md`).

## A. Readiness items (`engage.tenant_readiness`)

Needed only in `SEND_MODE=live`; sandbox does not ask for them. Recorded in Settings > Readiness (admin) or `PUT /api/engage/settings/readiness/:channel/:item`
with a value (who confirmed it and when, up to 200 characters) and an optional https evidence link. A channel's items are needed only for that channel.

<!-- readiness-items:start -->
| Channel | Item | Who provides it | What to record (value and evidence) | Where it comes from |
|---|---|---|---|---|
| `email` | `dpa_signed` | Tenant and Messign | "Signed 2026-xx-xx by <name>, version <x>"; evidence link to the stored copy | The processor agreement, kit part 1 **[LC]**. Needs a Messign legal entity (D-03) |
| `email` | `email_domain_authenticated` | Tenant (DNS) | Not typed in: set by the email domain check in Settings > Email domain | SPF, DKIM and DMARC records, `dns-and-email.md`. A pass older than 30 days no longer counts; Messign re-checks about daily |
| `sms` | `dpa_signed` | Tenant and Messign | As above | Same agreement |
| `sms` | `btk_sender_id` | Tenant, through the operator or provider | "Sender name <başlık> approved on <date> for <unvan>"; evidence link | The başlık application and its approval, `sms-baslik-iys.md`. SMS is not built yet (WP-28) |
| `sms` | `iys_brand_code` | Tenant | "İYS number <n>, brand number <m>"; evidence link | The tenant's İYS registration, `sms-baslik-iys.md` **[LC]** |
| `whatsapp` | `dpa_signed` | Tenant and Messign | As above | Same agreement |
| `whatsapp` | `waba_verified` | Tenant | "Business verified on <date>, WABA <id>"; evidence link (a screenshot of the Meta Business verification page) | Meta business verification, `whatsapp-waba.md` |
<!-- readiness-items:end -->

## B. Setup the gate and the Settings screen also check

Not readiness items, but each one makes the Settings screen say "Sending cannot be turned on yet" or makes the gate hold or deny every message. The first
column is the exact problem code (`readinessOn` in `server/src/engage/campaigns/campaigns.ts`, and the gate's own codes).

<!-- setup-codes:start -->
| Code | What it means | Fix | Who |
|---|---|---|---|
| `send_mode_off` | The server's `SEND_MODE` is off (the default) | Operator sets `sandbox` for a rehearsal, `live` for the pilot environment only, after gates 1 to 3 are green | Messign operator |
| `tenant_send_disabled` | The tenant's own switch is off (the kill switch; it starts off) | Settings > Sending > Turn sending on, after everything else on this page is clear. The request is refused while anything is missing | Tenant admin |
| `no_email_account` | No active email account | Operator stores it with `npm run engage:add-account` (secrets typed at hidden prompts), see `dns-and-email.md` | Messign operator, with the tenant's ESP keys |
| `email_account_ambiguous` | More than one active email account | Disable all but one | Messign operator |
| `account_mode_mismatch` | The account is `test` but the server runs live, or the reverse | Sandbox needs a `test` account, live needs a `live` account | Messign operator |
| `no_rate_card` | No marketing rate card (the cost of one message) | Settings > Budget caps and rates | Tenant admin |
| `no_budget_cap` | No monthly budget cap for the channel | Settings > Budget caps and rates | Tenant admin |
| `public_links_missing` | `ENGAGE_PUBLIC_APP_URL` or `ENGAGE_PUBLIC_API_URL` is not an https URL on the server, so unsubscribe links cannot be built | Operator sets both variables in Railway | Messign operator |
| `readiness_missing` | Live mode only: one of the items in section A is not recorded for the channel | Record it (section A) | Tenant admin |
| `sender_identity_mismatch` | The email account's From name differs from the sender name in Settings. Every message is denied. Not shown by the readiness check: it appears as a gate denial and as an attention item | Make them the same text. The sender name: Settings > Sender name. The From name: the account's `from_name` setting, changed by rotating the account (`POST /api/engage/channel-accounts/:id/rotate` with `config.from_name`, or a new `engage:add-account --config from_name=...`). No sender name set, or no From name on the account, is not a mismatch | Tenant admin and operator |
<!-- setup-codes:end -->

## C. The sequence

Use this order; each step names the screen or command and what "done" looks like. Items that wait for the tenant's paperwork are the ones that set the
date; the rest is the same day.

| # | Step | Done when |
|---|---|---|
| 1 | Processor agreement signed (kit part 1) **[LC]**; hosting and transfer position confirmed **[LC]** (pilot gates 1 and 2) | Signed copy stored; `dpa_signed` recorded for each channel to be used |
| 2 | Create the tenant: `npm run engage:provision` (operator terminal). The admin changes the one-time password at first login | The admin can sign in to the Lucy page and sees Settings |
| 3 | Settings > Sender name: the name customers know the shop by | Saved; the card no longer says "Not set" |
| 4 | Email: DNS records on the sending subdomain, ESP account, `engage:add-account` with `from_name` **equal to the sender name** | Settings > Channel accounts shows one active email account in the right mode |
| 5 | Settings > Email domain: name the DKIM selectors, run the check | The item `email_domain_authenticated` shows "Checked" |
| 6 | Settings > Budget caps and rates: a marketing and a transactional rate card and a monthly cap for each channel | The Sending card no longer lists them |
| 7 | CSV exports: customers, consents with evidence, orders (`csv-templates/`); import with the dry run first | Dry run says 0 rejected rows you care about; the real import ends with the same counts |
| 8 | İYS (if the tenant uses it): connect, check, first sandbox verification (`docs/runbooks/iys-sync.md`) | Settings > İYS says ok |
| 9 | WhatsApp (if used): `whatsapp-waba.md` | Settings > WhatsApp checklist green; `waba_verified` recorded |
| 10 | Rehearsal in `SEND_MODE=sandbox` to the staff allow-list (Phase A of the pilot design): one campaign, one unsubscribe, one STOP. The operator puts the staff addresses on the sandbox allow-list: `npm run engage:allowlist -- add --org <uuid> --channel email --value <address> --label staff` (a terminal script; there is no Settings screen for it) | Messages arrive only to allow-listed inboxes; the unsubscribe blocks the next send |
| 11 | Pilot success criteria and holdout agreed (B7, D-08, D-11) | Written down and signed off by both sides |
| 12 | Kill-switch drill on the pilot environment with a timer (`docs/runbooks/pilot-runbook.md`) | Both switches timed; result recorded |
| 13 | Operator sets `SEND_MODE=live` in the pilot environment; the tenant presses **Turn sending on** | The Sending card says on; the first message is a staff member's |

Gate 3 of the pilot gate list ("`send_enabled` set through readiness checks; `SEND_MODE=live` only in the pilot environment") is step 13. Gates 4 to 8
are evidenced on the synthetic tenant (`docs/quality/e2e-report-wp30.md`) and are re-run, not re-argued, per tenant.
