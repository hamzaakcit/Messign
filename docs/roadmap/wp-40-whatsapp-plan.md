# WP-40 plan: WhatsApp in the platform

**Status:** approved 2026-11-23 ("Approve, start 40a"). 40a built (ADR-025); see "Changes while building 40a" at the end. **Author:** Claude, 2026-11-23. **Builds on:** WP-27 (adapter, webhooks, ADR-023), WP-29 (ops), WP-22 (Settings).

## 1. Why

WP-27 made sending a WhatsApp template possible (adapter, webhook, STOP handling, send gate, live-checked once with a Meta test number). Nothing in the product can *use* it. Today a tenant cannot create a WhatsApp template, put one in a journey, send one to a segment, record a customer's WhatsApp consent in the UI, or see whether Meta approved a template. ADR-023 listed all of that under "Not in v1"; no work package owned it. WP-40 closes the gap.

**Goal in one sentence:** a tenant admin can run, from the Lucy page, a WhatsApp journey or a one-off WhatsApp campaign end to end, with the same safety as email (send gate, consent, holdout, results, trail) and with the things that are specific to WhatsApp handled properly: Meta's template approval, categories, the customer's own stop options, per-recipient marketing limits and account messaging limits.

## 2. What Meta's documentation says (read 2026-11-23; paraphrased)

Facts the design depends on. Unconfirmed items are marked and are verified in the live check (section 8), not assumed.

- **Templates must be APPROVED to be sent.** Statuses: APPROVED, PENDING, REJECTED, PAUSED, DISABLED, IN_APPEAL, LIMIT_EXCEEDED, ARCHIVED, DELETED, PENDING_DELETION. Paused and disabled templates cannot be sent. Review can take up to 24 hours.
- **Categories:** MARKETING, UTILITY, AUTHENTICATION. Meta can *recategorize* a template (`correct_category`, `previous_category`). Billing follows the template's category.
- **List templates:** `GET /<version>/<WABA id>/message_templates?fields=name,language,status,category,quality_score,rejected_reason,components,last_updated_time&limit=…` with cursor paging (`paging.next`). Quality is `quality_score.score` (GREEN, YELLOW, RED, UNKNOWN). Needs a token allowed to read the account's templates; the exact permission name was **not confirmed** from the pages (expected: whatsapp_business_management).
- **Status webhook:** field `message_template_status_update` (subscribe it next to `messages` and `user_preferences`). Payload carries event (APPROVED, REJECTED, PAUSED, DISABLED, FLAGGED, REINSTATED, …), template id, name, language (hyphen form, `en-US`), reason, category, and for pauses `other_info.title`. The language in the webhook uses a hyphen, the send API an underscore: the code must normalize.
- **Components:** body (required, max 1,024 characters), header (optional, text max 60 characters with at most one variable, or media), footer (max 60, no variables), buttons (quick reply up to 10, URL max 2 with one variable appended to the end of the URL, phone max 1). Variables are positional `{{1}}` or named; creation needs example values. Adjacent variables with no text between them are rejected by Meta.
- **Send shape:** body parameters `{type:"text", text}` in order (confirmed). URL button: `{type:"button", sub_type:"url", index:"0", parameters:[{type:"text", text:<percent-encoded suffix>}]}` (confirmed on the components page). Text-header and quick-reply send shapes were **not shown** on the pages read.
- **Per-user marketing limits:** Meta may stop delivering marketing templates to a particular customer who has received many from any business; the failure is error **131049**; wait at least 24 hours before resending. Marketing templates are not delivered to US (+1) numbers.
- **Opt-in:** Meta only allows messaging users who opted in; our send gate already requires WhatsApp consent.
- **Not confirmed from the pages read** (must not be guessed): the permission scope for listing templates, the exact meaning and trigger of 131050, characters Meta rejects inside a variable value (newline, tab, long space runs are commonly rejected: we sanitize conservatively and verify live), the business messaging-limit tiers and which error they raise.

## 3. Design principles

1. **Same pipeline, no second send path.** WhatsApp messages are created by the same functions, pass the same gate, and are sent by the same dispatcher as email. Only template building, readiness and consent differ.
2. **Messign never writes or submits templates to Meta in v1.** The tenant creates and gets them approved in WhatsApp Manager; Messign registers *how to fill them* and mirrors their status. (Submitting templates through the API is a later package: it changes what Messign is responsible for.)
3. **Fail closed on anything unknown.** A template whose status is not APPROVED, unknown in live mode, or whose category conflicts with the message's purpose is denied by the gate with a named code, never sent.
4. **A marketing-category template can never be sent as `transactional`.** Transactional skips the consent check; Meta's category is the authority on what is promotional. This is the most important compliance rule in the package.
5. **No personal data in logs, errors, alerts or LLM prompts**; variable values are rendered by the pure renderer only (R-5).
6. **English UI only**, no compliance claims; secrets never in the browser (accounts and tokens stay in the terminal flow).

## 4. Scope in three deliverables (three PRs, each merged on green and your word)

### 40a. Foundation: templates, rendering, approval status, gate

**Migration 137** (`137_engage_whatsapp_templates.sql`)
- `engage.templates.channel` check allows `'whatsapp'` (key and name stay on the existing table, so a journey still refers to a template by key).
- `engage.whatsapp_template_versions` (append-only, forced RLS, no update or delete for the engage role): template id, version, `meta_name` (`^[a-z0-9_]{1,512}$`), `language` (`tr`, `en_US`), `purpose_hint` (marketing or utility, the author's declaration), `body_text` (the approved text with `{{1}}…`, kept for preview and for checking the count), `variables` (ordered list: position, source attribute | payload | system, name, default), optional `header_variable` (v1: text header with one variable) and optional `url_button` (index, one variable, base URL stored for preview), `opt_out`: `quick_reply` | `text_in_body` | `none` (the author's declaration of how the customer can stop; see gate), created by and at.
- `engage.whatsapp_template_status` (per tenant, account, name, language): status, category, `correct_category`, quality score, rejected reason, last checked at, source (`sync` or `webhook`), and the component summary Meta returned (body variable count, button kinds) for the consistency check. Updatable by the engage role (it mirrors an external state), with history in the existing event style (one row per change in `engage.whatsapp_template_events`, append-only).
- Indexes for each foreign key (the schema FK-index test), `ops_work`-style SECURITY DEFINER function only if the sync job needs one (ids only, added to the isolation test's reviewed list).

**Adapter and provider seam** (send boundary preserved: only the messaging module resolves adapters)
- `ChannelAdapter` gets an optional `templates` capability: `list(account)` returning normalized `RemoteTemplate[]`. The WhatsApp adapter implements it with `GET /<WABA id>/message_templates` (paged, `limit`, a hard page cap), reading the token from the credential store like a send. `readConfig` accepts an optional `waba_id` (digits, not a secret).
- `parseWebhookPayload` also returns `templateUpdates` from `message_template_status_update` (language normalized, unknown events ignored, a malformed payload still refused as a whole).
- `buildSendBody` supports one text header parameter and one URL-button parameter (percent-encoded, https-safe suffix, length-capped), in addition to body parameters. Documented confirmed shapes only; the header shape is flagged for live verification.

**Rendering** (`whatsapp/render.ts`, pure, no database, no network)
- Inputs: version mapping, profile attributes, trigger payload, system values (`sender_name`). Output: `body_parameters[]`, optional header and URL-button parameters, or a `render_error` with a code and variable names only.
- Rules: a missing value without a default fails the render (the gate then denies `render_<code>`, as for email); values are trimmed and sanitized (newlines, tabs and runs of spaces collapsed to one space; empty value rejected; length-capped); the number of values must equal the number of variables in `body_text`; adjacent variables with no separating text are refused when the version is saved (Meta would reject the template); `body_text` over 1,024 characters refused.
- Preview text is the `body_text` with the real values filled in (for the Templates screen and campaign preview), clearly labelled as Messign's rendering, not Meta's.

**API** (extends `/api/engage/templates`, same auth: users read, admins write)
- `POST /templates` accepts `channel: "whatsapp"` with the WhatsApp content fields; `POST /templates/:id/versions` likewise; `GET` returns the channel, the latest version's mapping and the latest known Meta status; `POST /templates/:id/preview` renders with a real profile or sample attributes.
- `POST /whatsapp/templates/sync` (admin): runs the template check now for the tenant's WhatsApp account; `GET /whatsapp/templates` returns the mirrored statuses (including templates that exist in Meta but have no Messign mapping, so the admin can see what to register).

**Status sync**
- Webhook updates applied in the same request (idempotent: the event key is template id, event and time).
- Scheduled check (hourly, same job family as the email domain check, ids only across tenants, measurement in the tenant's own transaction) and on demand. A failed check never changes a status; it records the failure so the screen can say "last checked 3 hours ago, failed".
- Consistency check: the mapping's variable count and button shape against the components Meta returned (a mismatch is the cause of `wa_132000` in production, so it is caught before sending: `template_mapping_mismatch`).

**Send gate additions** (`messaging/gate.ts`, evaluated only for `channel = whatsapp` template messages; each is a named, tested reason code)
- `template_not_approved` (status known and not APPROVED, including PAUSED and DISABLED), `template_status_unknown` (never synced; denied in live mode, allowed in sandbox so a Meta test number's sample template works), `template_category_mismatch` (a MARKETING-category template with purpose `transactional`, the compliance rule above), `template_mapping_mismatch`, `content_no_opt_out` for marketing when the version's `opt_out` declaration is `none` (the declaration is the author's, Messign cannot read the template buttons reliably; Meta's own rules apply on top).
- Existing rules unchanged: WhatsApp consent, suppression, quiet hours (defer), frequency cap, budget, sandbox allow-list, `waba_verified` and `dpa_signed` in live mode.

**Account messaging limits and pacing**
- New rule `account_pacing` (a `defer`, never a deny, so a campaign larger than the account's limit simply continues the next day instead of losing recipients): a per-account rolling 24-hour limit of distinct new recipients, from account config `daily_recipient_limit` (default conservative, 250, until an admin sets the real tier shown in WhatsApp Manager). Plus a dispatch rate cap per account (`max_per_second`, default well below Meta's documented throughput) so a 5,000-customer campaign does not hit rate limits. **To verify against Meta's messaging-limits page before building** (not read yet).
- Error 131049 (per-user marketing limit) is classified as final for that message but the customer is **not** suppressed and consent is not touched; it counts in delivery health (it already shows as a failed report) and the Settings text explains it.

**Tests (40a):** unit (renderer: defaults, sanitization, adjacency, counts; webhook template parsing; gate rules each way, including the marketing-category-as-transactional case and sandbox vs live unknown status); integration against the mock Graph server extended with a `message_templates` endpoint (statuses, paging, quality, recategorization) and template status webhooks (signed): sync, webhook update, idempotent replay, forged webhook rejected, mismatch caught, PAUSED blocks the next send, isolation (tenant B never sees tenant A's templates or statuses), `account_pacing` defers and resumes, FK-index and DDL-freeze guards. Mock gets the new endpoints from the documented shapes; ADR says it follows the documentation, not Meta.

### 40b. Use it: journeys, campaigns, segments, consent

**Journeys**
- Message step: `channel: email | whatsapp`. Save-time validation: the named template exists, its channel matches the step's channel, a pinned version exists, and (live mode) a WhatsApp template is APPROVED. Activation re-checks approval; an unapproved template blocks activation with a clear issue, not a runtime failure.
- Engine (`createStepMessage`): builds the WhatsApp message from the registry (`createWhatsappTemplatedMessageOn`, same transaction, same idempotency key `journey:<enrollment>:<step>`), finds the tenant's one active WhatsApp account (none or more than one fails the enrollment with `no_whatsapp_account` / `whatsapp_account_ambiguous`, as for email).
- **Channel fallback:** branch conditions gain `consent.<channel>` (`granted`) so a journey can say "WhatsApp if the customer has WhatsApp consent, otherwise email". Evaluated per enrollment at that moment from `consent_state`; no new data path. This is what makes the channel useful where WhatsApp consent covers only part of the base.
- Editor: channel selector on a message step (only channels with an active account and a template of that channel are offered), WhatsApp step shows the template, its approval status chip and a rendered preview; a template that is not approved is marked and blocks activation.

**Segments**
- `consent.whatsapp` (and its phone-identifier prerequisite) added to the segment language and compiler next to `consent.email`; segment counts match SQL (existing acceptance style). Documented in the segment form.

**Campaigns** (ADR-018 generalized, ADR-025)
- `channel` on the preview and send requests; the template must match; the audience is the segment AND consent for that channel AND (for WhatsApp) an active phone number, and the preview shows the three numbers separately (in segment, consent, reachable) so an empty-looking campaign is explained.
- `readinessOn(channel)`: account (exactly one active), mode matches send mode, rate card and budget cap for that channel, readiness items (`dpa_signed`, `waba_verified`) in live mode, template approved, and for WhatsApp **no** public-link requirement (that one is email only: an unsubscribe link is not part of a WhatsApp template).
- Campaign list, detail and results show the channel; UI copy no longer says "email" where it means any channel. Confirmation text names WhatsApp and the template's Meta category (a marketing template is shown as such).
- One send per idempotency key, resumable chunks, holdout: unchanged.

**Consent capture (the other half of "usable")**
- Customers page "Add customer": phone and WhatsApp consent with a required evidence note, same rule as email consent (server refuses consent without evidence; verifies a valid phone).
- Customer detail: WhatsApp consent history already shows; add a one-line explanation of what stops WhatsApp (STOP reply, the WhatsApp app option, an admin revoking) with the ledger source labels (`whatsapp_stop_message`, `whatsapp_preference`, `whatsapp_131050`) written in plain English.
- CSV import: `consent_whatsapp` and `phone` are already supported; the onboarding kit (WP-33) gets the column documented. WhatsApp consent evidence for existing customers is the tenant's responsibility; we only record it.

**Tests (40b):** end-to-end through the real pipeline against the mock Graph: a journey with a WhatsApp step sends once (retry creates no duplicate), a customer without WhatsApp consent takes the email branch, a segment campaign to 200 customers with mixed consent sends only to consented ones, holdout respected, STOP reply revokes and the next campaign excludes the customer, PAUSED template blocks activation and sends, tenant isolation across all new paths, client component tests for the editor, campaign screen and consent form (English strings only).

### 40c. Operate it: Settings, ops, docs, live check

**Settings (tenant admin) — WhatsApp card**
- Setup checklist with live state: account present (and mode), `waba_id` set, webhook URL to paste into Meta (built from `ENGAGE_PUBLIC_API_URL`, with a copy button), fields to subscribe (messages, user_preferences, message_template_status_update), last webhook received, token check (a cheap read call: a bad token shows `wa_190` guidance before a campaign fails), readiness items `waba_verified` and `dpa_signed`, rate card, budget cap, daily recipient limit.
- Templates panel: every Meta template with status, category, quality, last checked, "Check now", and "Register in Messign" for ones without a mapping; paused or rejected templates in use by an active journey show in "Needs attention".
- Secrets stay in the terminal (`engage:add-account`, which gains a `--config waba_id=` hint and a `--whatsapp` preset); the card says so, as the email card does.

**Ops (WP-29 layer)**
- New rules: `whatsapp_template_unhealthy` (an approved template used by an active journey or a sent campaign in the last 7 days became PAUSED, DISABLED, REJECTED or quality RED), `whatsapp_template_check_failing` (the check failed three times in a row), `whatsapp_frequency_limited` (131049 failures above a share of recent sends; informational, tells the tenant to slow down or change content), `whatsapp_pacing_holding` (messages deferred by `account_pacing` for more than a day: the limit or the campaign size needs a look).
- Attention text and gate-denial text for every new code, in plain English.

**Documents**
- `ADR-025-whatsapp-in-platform.md` (decisions above, what is not done), runbook `whatsapp.md` rewritten around the product flow (register template → sync → journey/campaign), `send-a-campaign.md` extended, `ops-monitoring.md` alert table extended, backlog, weekly progress, pending decisions (D-18 below).

**Live check (needs you; not before 40c merges)**
With the Meta test number and your phone: sync (confirms the listing permission and the field names), send a campaign of one, read DELIVERED, reply STOP, then the checks listed in the runbook. Results go into the ADR as verified or not verified, never as assumptions. What stays unverified until a real number and a real marketing template exist: `user_preferences` stop, 131050, a permanent system-user token, URL-button and header live shapes, the real messaging-limit tier.

## 5. Explicitly not in WP-40 (so nobody assumes)

Creating or submitting templates through Messign, media headers and carousels, interactive and flow messages, authentication templates (OTP), two-way conversations or an inbox, replies to customers, business-scoped user ids (usernames without a phone number), per-message price tracking from status webhooks, template A/B tests, a visual template builder, multiple WhatsApp numbers per tenant (the one-callback-URL-per-Meta-app limit needs its own design), SMS (WP-28).

## 6. Risks and how they are handled

| Risk | Handling |
|---|---|
| Meta's real behaviour differs from the mock | The mock is extended only from documented shapes; unverified shapes are listed and checked in the live check; the gate fails closed on unknown status in live mode |
| A marketing template sent as transactional bypasses consent | `template_category_mismatch` in the gate, with a test; also a save-time warning in the editor |
| Large campaign hits Meta limits and silently loses customers | `account_pacing` defers instead of denying; alert when held a day; campaign results show held, not failed |
| Template changes at Meta without us knowing | Hourly sync plus the status webhook; PAUSED and DISABLED block sends within one webhook, within an hour at worst |
| Mapping drift (variable count) | Consistency check against Meta's components before sending |
| Customer uses a WhatsApp username (no phone) | Documented known gap (ADR-023); unchanged |
| Scope creep | The non-goals list above; each deliverable merges separately |

## 7. Order, size and checkpoints

40a is the largest and riskiest (migration, adapter, gate, sync); 40b is the most visible; 40c makes it operable and documented. Each is its own PR with its own full test run (server, client, tsc, scratch Postgres) and is merged only on your word. After each merge I report what works, what is verified only against the mock, and what you must do. No production change happens without your terminal (migration 137 in particular).

## 8. Decisions I need from you (D-18)

1. **Plan approval**: go as three PRs (40a, 40b, 40c).
2. **Default account limit**: start `daily_recipient_limit` at 250 (Meta's starting tier for an unverified business, to be confirmed in the docs before building) until the admin sets the real figure. Conservative on purpose.
3. **Fallback branching** (`consent.<channel>` in journey conditions) is in 40b. It adds a small, general feature to the condition language; say if you would rather keep conditions unchanged and use two journeys.
4. **Template submission through Messign** stays out (principle 2) until a tenant asks.

## Changes while building 40a (2026-11-23)

- **Meta's limits confirmed** from the messaging-limits page: 250 new customers in a moving 24 hours at the start, then 2,000, 10,000, 100,000, unlimited, per business portfolio; no error code is documented for reaching it. Throughput is 80 messages per second by default, so the planned per-second dispatch cap was dropped (dispatch is sequential and far below it; 130429 is retried).
- **Adjacency and start/end checks on the body were dropped:** a registration describes a template Meta has already approved, so Meta's own review has applied them.
- **Message lifetime:** the 24-hour default would have let every paced message expire as it became sendable. WhatsApp template messages live 3 days by default, and the gate refuses at once (`account_limit_reached`) a message that would expire before there is room.
- **Client in 40a:** WhatsApp templates appear in the template list, so 40a already labels them, shows them read-only with their Meta status, and keeps them out of the email pickers of journeys and campaigns (they would otherwise have been offered for email steps).
