# Weekly Progress

Append one entry per session: date · session · WP · done · remaining · next · blockers. Newest on top.

## 2026-11-25 · Marketing counter MC-18: the model writes the caption
- **Done:** Stacked on MC-16 (PR #78). Decision (yours): the model writes the caption. The offer now has **Write caption** (and **Rewrite caption**) next to its caption, while the post is a draft. `POST /api/marketing/content/:id/caption` loads the post and its offer sheet, asks the model once through the existing gateway (`buildCallLLM`, creative tier), and saves the text on the post. New `services/marketing/offerCaption.ts`: a pure prompt builder (the sheet's language, Turkish by default, product, price, claim, place, audience, intent; "use only these facts"; no customer data, no contact details, 3 to 5 hashtags, under 2,200 characters), a cleaner, and a drafter that refuses a sheet with no product or intent and discards an answer carrying an email address or phone number. Only a **draft** post is written or rewritten (409 otherwise), so text that went to review is not replaced after the product-truth and brand-voice checks ran on it. No schema change, nothing is sent or published. The post panel's "Lucy is writing the caption. This usually takes a minute." is now "No caption yet. Open the offer and press Write caption." and the first picture button reads **Make still** instead of Regenerate. Tests: 11 server (prompt, cleaning, the refusals, a model failure), 4 client (button, enable Looks good, no button once in review, Make still, honest strip text), and a smoke test (9 now). One client test waited for the offer's children now; it had passed alone and failed once under load. Client typecheck is clean and 700 client tests pass twice; server typecheck is clean and the 93 marketing server test files pass. Browser, real model on the dev server: the Lilyana offer from the dogfood got a Turkish caption in 12 s from its own facts (Lilyana, ₺450, daisies, Nişantaşı, Teachers' Day) with five hashtags, and Looks good became enabled. Not clicked.
- **Cost:** one model call on the dev server for that caption. A caption costs one call each time it is written.
- **Next:** MC-12 (a campaign is a name on a set of offers). Then use the calendar on a real approved post, which the dogfood could not reach before.
- **Blockers:** none.

## 2026-11-25 · Marketing counter MC-16 and MC-17: dogfood and cut list
- **Done:** One Kitapyurdu offer (Tutunamayanlar, cart reminder, email only) and one Lilyana offer (Papatya buketi, occasion with a post) were made from the new home in the browser, on the dev servers, drafts only, Lucy never opened. Kitapyurdu finishes: draft plus journey email, Looks good enabled (not clicked). Lilyana saves with a post and an email and the still can be made, but **Looks good stays disabled because nothing writes the post's caption** (new MC-18). Three bugs found and fixed, each with a test that fails on the old code: the offer panel stayed stale after Regenerate (the post was not reloaded); the list stayed stale after anything done in the panel (it now reloads when the panel closes); an email-only offer showed an empty still, "No caption yet." and "Scene sent to Fal". Open findings (caption, the "Lucy is writing the caption" line, the Regenerate label, an empty Picture step for email-only, dark controls on paper, the switcher's accessible name) and the cut list are in `docs/ux/dogfood-mc16-cut-list.md`. Calendar, Builder and Shop settings were not opened by hand, so they are kept. Client typecheck is clean and 696 client tests pass.
- **Real cost:** one Fal image (Lilyana, 14 s) and the journey-email draft for each offer, on the dev database. The two offers and the still are still in it.
- **Next:** MC-18 (a caption for the post), then MC-12 (campaign as a name on a set of offers).
- **Blockers:** MC-18 needs a decision: generate the caption with the creative model, or type it by hand first.

## 2026-11-25 · Marketing UX UX-09: Playwright smoke
- **Done:** PRs #72–#76 are merged, so this is on main. A browser smoke test clicks the primary action on every kept marketing screen, with the API mocked: `e2e-marketing/` (`marketing.smoke.spec.ts`, `mockApi.ts`) and `playwright.marketing.config.ts`. It needs only the Vite client on port 3300 (surface `workspace`): no server, database or login, because the mock answers every `/api` call and the session is seeded into storage. Run it with `npm run e2e:marketing`; it is a new CI job, **Marketing smoke (Playwright)**, which uploads `test-results/` when it fails. Eight tests: **Offers** (list, status filters, open an offer), **Offer detail** (Looks good sends the post to review, a manager approves it, the `⋯` menu lists the post and email, Escape closes only the menu), **New offer** (a product drop cannot leave step one without a product, Back keeps the words, Looks good saves a draft and makes no publish or schedule call), **Calendar** (an approved post waits in the tray and is scheduled by a drop on a day; the live-send warning appears only when the mode is live), **Builder** (designs listed, New email opens its form and refuses to create without a design, writing nothing, then closes), **Shop settings** (reached from More and from the tab bar, one card per shop, brand profiles, no Brands button). Each test also fails on a page error, and the page tests fail on a marketing API call nobody mocked: that guard caught the brand-profile stats call on its first run. 8 of 8 pass, twice in a row and with `CI=1`.
- **Not covered:** the Unlayer editor itself (it is third-party and loads from the network), sending or publishing (the mock has no live path), and the Engage tabs (their own suite, `playwright.engage.config.ts`). The older `e2e/` specs need the real server and were not run. `e2e/contentStudioDogfood.spec.ts` opens `/marketing` and clicks an "Instagram post" button; check it before relying on it, since New offer replaced that path.
- **Next:** UX roadmap is complete. Remaining marketing work is MC-12, MC-16 and MC-17 in the backlog.
- **Blockers:** none.

## 2026-11-25 · Marketing UX UX-08: leftover duplicates
- **Done:** Stacked on UX-05 (PR #75). Duplication groups 3 and 7 are closed; 9 was already closed in UX-06. **Create (group 3):** the tab bar's "New" menu (Campaign, Content, Instagram post, Email) is now one **New offer** button. Instagram post already went to New offer, and Email is the Builder tab. Content and Campaign opened forms whose drafts and campaigns nothing on these pages lists, and since UX-07 the calendar no longer opens the content form. `ContentCreatePanel` (with its Instagram preset), `CampaignCreatePanel`, their slide-overs and the create-panel state in `MarketingContext` are deleted, along with the unused `openInstagramContent` route-state handler. **Editor (group 7):** `UnlayerEmailEditor` is deleted, and Builder, the content email controls and `useEmailBuilderState` use `UnlayerEditor` with `displayMode="email"`. **Lucy channel forms:** the composer only ever opened the email brief, so `MarketingChannelAgentModal` and `marketingChannelAgentBuilders` keep only email (420 → 136 lines in the modal); LinkedIn, X, blog, ads and metrics are gone. Tests: one for the single New offer button; the builder tests now cover the email brief and its validation; `contentCreatePreset.test.ts` is deleted. Client typecheck is clean and 693 client tests pass. Browser: the tab bar shows only New offer; Builder → New email opens the editor's template picker; Ask Lucy → Email opens the brief with Audience, Offer / topic and Notes. Nothing was saved or sent.
- **Next:** UX-09 (Playwright smoke).
- **Blockers:** none. PRs #72–#75 are open and stacked; merge them in order.

## 2026-11-25 · Marketing UX UX-05: Shop settings page
- **Done:** Stacked on UX-04 (PR #74). The floating **Brands** button over every marketing screen and its slide-over are gone. Content setup and brand profiles now live on one page, **Shop settings** at `/marketing/shop` (`ROUTES.MARKETING_SHOP`), on paper (light theme, per UX-D1). It is reached from the tab bar (Offers · Calendar · Builder · Shop settings) and from More on the offer list. The old `/marketing/brand-social` URL lands there. `brandManagerOpen`/`openBrandManager`/`closeBrandManager` are removed from `MarketingContext` (MC-11). Two new tests in `LucyMarketingPage.test.tsx`: More opens Shop settings with no Brands button, and the old URL redirects. Client typecheck is clean and 699 client tests pass. Browser: `/marketing/shop` shows Content setup (Messign, Lilyana, Kitapyurdu) and Brand Profiles, with no errors once the dev server was up.
- **Next:** UX-08 (leftover duplicates).
- **Blockers:** none. PRs #72, #73 and #74 are green and need a merge; this one stacks on them.

## 2026-11-25 · Marketing UX UX-04: one offer list
- **Done:** Stacked on UX-07 (PR #73), which sits on UX-06 (PR #72). The Pipeline board is gone. The offer list has status filters (All, In progress, In review, Approved, Scheduled, Live; kept in `?status=`). `/marketing/pipeline` and `/marketing/content` land on it and keep `?contentId=`, so old links still open their item. `/marketing/approvals` lands on "In review". The tab bar is Offers · Calendar · Builder, and its "← Lucy" back link is gone because Offers is the same place. The list loads email children too, and each row's status comes from its post (or, for a cart offer, its email); it used to read the offer row, which is always a draft. **Approval had to move:** the board's Review lane was the only way to approve, and "Looks good" never created an approval-queue row, so offers made through New offer could never reach "approved" (and the calendar's Ready tray). The offer now shows **Approve** to a manager or admin when its post is in review. It uses the queue row if there is one, otherwise it sets the post to approved. The server now refuses `status → approved` on content create or update from anyone but a manager or admin (`services/marketing/approvalRole.ts`, with tests). Deleted: `MarketingPipelinePage`, `KanbanBoard`, `BoardCard`, `lib/boardMoves.ts` (added in UX-01, now unused), their tests, and the board handlers in `MarketingContext`. Client and server typechecks are clean, 697 client tests pass, and marketing server tests pass. Browser: the old Pipeline URL lands on Offers with the chips; rows show In review / Ready for review / Writing; the dev manager sees Approve on an in-review offer (not clicked).
- **Next:** UX-05 (Shop settings page replaces the Brands button).
- **Blockers:** none. PRs #72 and #73 are green or running and need a merge; this one stacks on them.

## 2026-11-25 · Marketing UX UX-07: calendar takes ready posts
- **Done:** Built on the UX-06 branch (PR #72, green, not merged yet). The calendar takes ready posts only (MC-10). A **Ready to schedule** tray lists approved posts with no day; drag one onto a day to schedule it. Dropping a draft or a post in review is refused with "Only approved posts go on the calendar."; a published post is not moved. When Instagram's send mode is live, the calendar says "Live sending is on: a scheduled Instagram post will be published on its day." Clicking an empty day no longer opens a create-content form: it created a draft on a day and was a duplicate way to create content. New `lib/calendarSchedule.ts`. Tests: `contentCalendarSchedule.test.tsx` covers the rule, the tray, a drop from the tray, a refused draft drop, the warning only in live mode, and no create form. Client typecheck is clean and 695 client tests pass. Browser: the warning shows (local `SEND_MODE` is live) and the tray lists 6 approved posts. Nothing was dragged on dev data.
- **Next:** UX-04 (one offer list: Pipeline becomes a status view of Offers).
- **Blockers:** none. Local `server/.env` has `SEND_MODE=live`; set it to off unless you are testing live sends.

## 2026-11-25 · Marketing UX UX-06: offer detail
- **Done:** PR #71 merged. The offer a shop opens from the counter now has one primary action. **Looks good** sends the Instagram post to review, or the email for a cart offer. It never schedules or posts, and it stays disabled with a one-line reason until the still and the caption exist (MC-08). Everything else is under `⋯`: open the Instagram post, open the email, and draft the journey email (only while none exists). The **journey email** block shows subject, product, price, window and whether the unsubscribe line is there, read from the drafted email; Unlayer is not opened (MC-07). The always-visible "Ultra keeps…" line became an InfoTip, shown only when a reference photo is attached. The post's own detail also stops offering "Draft journey email" once the email exists (duplication group 9). New: `components/ui/OverflowMenu.tsx` (ADR-026), `lib/offerReview.ts`, `lib/journeyEmailSummary.ts`. Fixed: Escape in an open menu or tooltip inside a slide-over closed the whole panel. Open layers now carry `data-escape-layer`, and `SlideOverPanel` waits for the next Escape. Client typecheck is clean and 689 client tests pass. Browser, bookstore offer: header shows Looks good + `⋯`; journey email shows "Kürk Mantolu Madonna", ₺189, Unsubscribe: Included; menu lists Open Instagram post / Open email; first Escape closes only the menu. Looks good was not clicked on dev data.
- **Next:** UX-07 (calendar takes ready offers; live-publish warning).
- **Blockers:** none.

## 2026-11-24 · Marketing UX UX-03: colour tokens
- **Done:** PR #70 merged. Marketing and engage no longer use any `app` colour class that generates no CSS. 100 `text-app` became `text-app-text`, 34 `border-app` (5 with an opacity suffix that never rendered either) became `border-app-border`, and 2 `divide-app` became `divide-app-border`. The 4 `bg-app` page backgrounds were removed rather than turned on, so the marketing shell, the surface gate and the public unsubscribe page look exactly as before. Unused `marketingShell.bgStack`/`bgTop` are gone. Visible change: borders that fell back to the browser's light grey now use the theme border colour. New test `__tests__/ui/appColorTokens.test.ts`. Client typecheck is clean and 675 client tests pass. Browser contrast check (text vs. its real background, threshold 2:1) found nothing low on Offers, Customers, Journeys, Settings, Pipeline (604 text elements), Calendar or Builder.
- **Next:** UX-06 (offer detail: one primary action, `⋯` menu, email readable without Unlayer).
- **Blockers:** none. The rest of the app still has 981 bare `app` colour classes (text, bg, border, divide; Company-OS screens); not in scope.

## 2026-11-24 · Marketing UX UX-02: help pattern
- **Done:** PR #69 merged. `InfoTooltip` is now a real button. It opens on hover, keyboard focus, or tap; a mouse click keeps it open; Escape closes it without reopening. It links its text by `aria-describedby`. With a `helpId` it shows the registry tip, and a "Learn more" link when the entry has a body. New: `lib/helpContent.ts` (six entries), `HelpDrawer` (mounted once on `/marketing`, light theme), `stores/helpDrawerStore.ts`. Copy moved to the registry: the email wizard's Apply AI draft / Use template paragraph, the diagnostics brand-lock note (now "Builder edits") and motion note, the builder's "HTML only" notice, and the shop content-setup line. Deleted: the Instagram-draft publishing note in the content form, Lucy's Messign pitch, and "VA2 design manifest JSON" in the email brief. The content form's Lucy button opened New offer while its text said Lucy; it now reads "Use New offer instead". Explanatory text visible by default is about 40 words, down from about 400. Tests: `helpContent.test.ts` (one sentence, ≤ 120 characters, title ≤ 4 words, every `helpId` in source exists) and `InfoTooltip.test.tsx` (keyboard, Escape, tap, mouse, Learn more, legacy `content`). Client typecheck is clean and 673 client tests pass. Browser: the Brands panel tip opens on click; Lucy greets "Ask me about an offer, a caption, or an email."
- **Next:** UX-03 (tokens: ban bare `text-app`/`bg-app` in marketing and engage).
- **Blockers:** none. The Brands slide-over is still dark; UX-05 replaces it with a Shop settings page.

## 2026-11-24 · Marketing UX UX-01b + Phase 2 docs
- **Done:** PR #68 merged. Hamza ran migrations 138 and 139 on production. On a new branch: the Lucy composer offers Instagram (to New offer) and four email templates; the LinkedIn, X, blog, ads and metrics templates and their helper paragraph are gone. The selected engage tab label is readable: `text-app` generates no CSS, so it now uses `text-app-text`. The Lucy drawer on `/marketing` has a real background (it used the same non-existent `bg-app`) and sits above the Brands button, which covered its send button. Phase 2 docs: `docs/ux/design-principles.md`, ADR-026 (one component set in `components/ui`, InfoTip + HelpDrawer + `helpContent.ts` registry, defined colour tokens only), `docs/ux/target-ia.md` (five top-level items, before/after nav, five wireframes), `docs/ux/ux-roadmap.md` (UX-02…09). The backlog moves MC-07…11 and MC-15 to the UX track and marks MC-13/14 done. UX-D1 and UX-D2 are added to decisions. Client typecheck is clean and 654 client tests pass.
- **Decisions applied (same day):** UX-D1: no dark panels. Engage tabs, sections, create actions and panels on `/marketing` render in the light theme on the paper. Engage tiles, the primary create button and tab pills use theme tokens, so they work in both themes. UX-D2: the Builder is email-only and `/marketing/documents` redirects to it. In the browser, no white-on-white text was found in any engage section or the journey editor panel. Client typecheck is clean and 654 client tests pass.
- **Next:** UX-02 (help pattern).
- **Blockers:** none.

## 2026-11-24 · Marketing work merged with origin/main
- **Done:** The marketing work that sat uncommitted on an old `main` (WP-01 copy, CS-01..15, CP-01..11, MC-01..06, UX-A, UX-01) is on branch `feat/marketing-counter-and-ux-01` and merged with `origin/main`, which was 133 commits ahead. The branch's own WP-01 is replaced by upstream's merged WP-01: legacy adapters, publisher cron, `verifyRls`, admin auth, channels, AI gateway defaults, and CI. The branch's duplicate WP-01 helpers and tests are removed. Instagram keeps per-organization credentials and public image hosting, and Graph now runs only when `SEND_MODE=live`, which closes the test-publish finding. `/marketing` is the shop counter with upstream's Engage tabs after Offers, create actions under More, and Engage panels (ADR-016). `LucyEngage.test.tsx` is rewritten for that layout. Upstream's `BentoCard` is restored because `EngageHub` uses it. The branch's migrations moved after upstream's last one: `138_marketing_content_offer_type.sql` (only the `offer` content type; `tenant_id` is already in the baseline) and `139_marketing_instagram_connection.sql`, both idempotent. Client typecheck is clean and 654 client tests pass. Server typecheck is clean.
- **Next:** PR review and CI. Then founder decisions on the Lucy composer tiles, and the UX Phase 2 docs.
- **Blockers:** none.

## 2026-11-24 · Marketing UX UX-01: delete and hide
- **Done:** The unreachable marketing files are deleted: the old cockpit panels (14 of 16; `InstagramPreview` and `Va2DiagnosticsPanel` stay), the approval-queue and leads pages, the Instagram prompt modal, `InstagramConnect`, the old Lucy drawer, the campaigns section, unused barrels, and the tests that only covered them. Eight of those files had uncommitted edits or were untracked. They are in `git stash` as "UX-01 backup: uncommitted edits in unreachable marketing files deleted 2026-11-24". Fake controls removed: email Send in the email panel and the builder, the Publish rocket, Auto-schedule on the detail and in the calendar list. The pipeline now runs only two real moves: draft→review submits a content card; review→ready approves an approval card. Any other drop shows one line, for example "Posts go live from the calendar, not by dragging.", and changes nothing (`lib/boardMoves.ts`, with a test). Campaign Edit (no handler) is gone. The duplicate "Build email layout" banner is gone; the same draft is still built automatically once per session, and the sparkle button stays. The Unlayer env-var intro is gone from every builder header. The missing-project-ID warning shows in dev only. Builder's image Generate was not a visible No-op; it is never registered without a callback, so it needed no change. The Kitapyurdu shop-switch test now waits up to 5 s for the lazy panel. Client typecheck is clean. 482 client tests pass, in two parallel runs and one serial run. In the browser: dragging a draft to Live shows the calendar message and the counts stay. A LinkedIn draft shows only Schedule. New Email shows no setup text. Calendar list view has no Auto. Not clicked: review→ready on real data, because it would approve dev content. Nothing is committed.
- **Next:** founder decisions (Lucy composer channel tiles; Instagram test publish versus `SEND_MODE`), then Phase 2 docs: design principles, ADR-010, target IA, UX roadmap.
- **Blockers:** none for docs. Main still holds uncommitted MC work mixed with these changes.

## 2026-11-24 · Marketing UX: frozen screens removed from the UI
- **Done:** The founder decided to remove the frozen marketing screens instead of hiding them. Intel, Brand & social, Funnel, Campaigns & lab, Lucy sandbox, and the CEO dashboard are gone from the client. Their old URLs redirect to `/marketing`. Builder offers Email and Documents only; `/marketing/pages` and `/marketing/popups` redirect to Builder. The offer detail no longer has Atomize to channels. The calendar no longer has the funnel strip. Marketing no longer fetches command-center or funnel data. The command palette's "Marketing > Campaigns" is gone and "New Campaign" became "New Offer". The two dashboard to-dos now point at offers and the calendar. All backend routes are unchanged (ADR-001: delete UI only). Client typecheck is clean. 515 client tests pass when run serially. In the parallel run, "closes Dora when the shop changes to Kitapyurdu" timed out after 1 s waiting for the lazy offer panel; it passes alone. In the browser, More and the tab bar show Pipeline, Calendar, and Builder. `/marketing/intelligence`, `/sandbox`, and `/campaigns` land on `/marketing`. Builder shows All, Email, and Documents. Offer and content detail open. Nothing is committed: `main` already holds uncommitted MC work in the same files.
- **Next:** UX-01 rest: delete the 38 unreachable files and remove the six Mock and three No-op controls (`docs/ux/control-audit.md`).
- **Blockers:** founder answers on the approval-queue page, the Lucy composer's LinkedIn/X/blog/ads tiles, and Instagram test publish versus `SEND_MODE`.

## 2026-11-24 · Marketing UX UX-A (reconnaissance, docs only)
- **Done:** `docs/ux/` has the master prompt, inventory, control audit, duplication map, and copy audit. 38 of 182 marketing files (≈ 6,900 LOC) are unreachable. Six controls are Mock: email Send, drag to Live, the Publish rocket, two Auto-schedule buttons, and builder Send. Three are No-op: campaign Edit, drag review→ready on a content card, and Generate image in the builder. The home's More menu and the workspace tab bar both link to five frozen screens. Reachable explanatory copy is about 535 words. The trace was static; nothing was click-tested. No application code changed.
- **Next:** decide how UX work relates to the marketing-counter track, then UX-01 (delete and hide). Phase 2 docs (design principles, ADR-010, target IA, UX roadmap) are not written.
- **Blockers:** founder answers on the approval queue page, the composer channel tiles, and Instagram test publish versus `SEND_MODE`.

## 2026-11-23 · WP-33 follow-ups: sandbox allow-list script, stale runbooks
- **Done:** `npm run engage:allowlist -- list|add|remove` (operator terminal; normalizes like the gate, repeatable `--value`, refuses invalid values with exit 1, adding a listed value is a no-op), closing finding 1 of WP-33 (the staff rehearsal and the WP-34 dry run needed it). The SES and send-a-campaign runbooks now point at the Settings screen (sender name, rate cards, budget cap, Turn sending on) instead of SQL and code, finding 2. The kit, checklist, demo script and WhatsApp runbook name the script.
- **Verified:** argument parser unit test (12); the script run on the scratch PostgreSQL 17 (add with a valid, a repeated and an invalid value, list, remove, remove again, SMS number, empty organization, exit codes 0, 1 and 2); server full suite and both `tsc` run before the PR.
- **Not done, on purpose:** the From name still changes only by rotating the account (it needs the secrets again, so a Settings field would be a design change: a config-only update). The kill-switch drill on the real environment and the Meta template approval are Hamza's. The legal items are still **[LC]**.
- **Next:** WP-34 (business-start dry run), WP-31 (security hardening).

## 2026-11-23 · WP-33 Onboarding kit, pilot runbook and kill-switch drill
- **Done:** the kit in `docs/onboarding/` (README with the timeline, what the tenant signs, DNS and email account, başlık and İYS, WhatsApp WABA, the demo script on the synthetic tenants, CSV templates for customers, consents with evidence and orders); the checklist `onboarding-checklist.md` (section A: the readiness items; section B: the setup codes, including `sender_identity_mismatch`; section C: the sequence); `docs/runbooks/pilot-runbook.md` (on call, the two switches and how fast, rollback, key rotation, incidents, pilot stops); the drill script `npm run engage:kill-switch-drill` (mock account on a drill tenant only, sandbox only, `--stopwatch global|tenant` for the Railway part) with a scratch result in `docs/quality/kill-switch-drill-wp33.md`.
- **Tests:** the checklist is compared with `REQUIRED_READINESS` item by item (unit, always runs); every setup code the readiness check can report is in the document and the document has no other (real Postgres); the checklist followed through the Settings API takes a bare tenant to a gate that allows in live mode, and each required item taken away is refused with `readiness_missing`; the CSV templates go through the real parsers; `engageSenderName` gains the matching, differing, spaces-only, case, fix-by-rotation and changed-later cases through the Settings and account APIs (matching sends, differing is `sender_identity_mismatch` with no adapter call); the drill has 6 tests (pass with real timings, restores the switch and `SEND_MODE`, refuses a live or non-mock account, refuses an unready tenant, fails with the gate code on a name mismatch). Broke the code two ways and the drill failed both times (gate ignoring the tenant switch; both global checks removed).
- **Verified:** server full suite 2360 passed, 9 skipped (208 files passed, 2 skipped; scratch PostgreSQL 17 on port 5499, stopped afterwards); client 728 passed (118 files); both `tsc` clean. Drill, five runs on the scratch database: global switch held the next message in 0.01 ms; tenant write 0.73 to 0.87 ms, next message held 1.73 to 2.07 ms from the start of the write; 0 messages reached the adapter after a flip; 16 of 16 went out once after switching back.
- **Not done, needs you:** the drill on the real environment. It was not run on Railway, the development database or any production database; the exact commands are in the runbook (section 6) and the table to fill is in `docs/quality/kill-switch-drill-wp33.md`. The Railway global switch is a variable change and a redeploy, so its time is unmeasured until you run `--stopwatch global`. Pilot gate 6 is evidenced for the mechanism only until then.
- **Found (not fixed here):** (1) there is no screen or script to put addresses on the sandbox allow-list (code only: `addAllowlistEntry`), which the Phase A rehearsal (checklist step 10) and the WP-34 dry run need; (2) the SES runbook still says `send_enabled` is set by SQL and the rate card by code (the Settings screen from WP-22 replaced both); (3) the From name can only be changed by rotating the account (no Settings field), so the sender-name fix needs an operator or the API. The legal items (agreement, hosting, classification, başlık documents) are listed as **[LC]**: nothing in the kit is a compliance claim.
- **Next:** WP-34 (business-start dry run: a fresh synthetic tenant from zero using only the kit; close finding 1 first), WP-31 (security hardening). WP-28 stays blocked on Alaris's documentation.

## 2026-11-23 · WP-30 Sandbox end to end across the test ladder
- **Done:** one scenario on real Postgres and the real HTTP stack (`server/src/__tests__/engage/engageSandboxE2E.integration.test.ts`, 18 checks, about 5 s, runs in CI; `npm run engage:e2e`): a synthetic bookstore tenant onboarded through the Settings API, the synthetic CSV imported, eight hand-made customers for the eight ways a message may or may not go out, a "WhatsApp, else email" journey with approval, duplicate triggers and concurrent executors, shuffled and duplicated delivery reports, an email and a WhatsApp campaign during which customers unsubscribe, revoke in İYS and reply STOP, 90 simulated carts, both kill switches timed in the middle of a batch, the audit trail of all 325 messages, results against SQL, a second tenant, the ops check and the scheduled path. Pilot gates 4 to 8 each have evidence. Report: `docs/quality/e2e-report-wp30.md`.
- **Verified:** server full suite 2339 passed, 9 skipped (205 files, scratch PostgreSQL 17); both `tsc` clean. Broke the code 8 ways: 6 caught at once (consent, suppression, allow-list, tenant switch, both global-switch checks, duplicate trigger), 2 equivalent for stated reasons (one of two global-switch checks; allow-list tenant scope, which row-level security repeats).
- **Ladder:** step 1 done; step 2 (Twilio) not built and not needed; step 3 blocked (Alaris docs); step 4 not eligible for SMS (no account, docs or notice) and already done for email (WP-12) and WhatsApp (WP-40) in sandbox; nothing live was sent.
- **Found:** a campaign counts customers who have consent but no usable address (7 of 72 here; the gate blocks them as `no_recipient`, so nothing wrong is sent, but the numbers are high); a revocation carries the customer's own time, so a message sent before we pull it shows as sent with a revoked consent "in force" (true timeline; the İYS pull interval matters). Neither fixed here.
- **Not shown:** anything real, a browser run (Playwright not run), load, live-mode rules, the pg-boss schedule itself (the WP-40 live check exercised it). Meta still has to approve `messign_live_check`.
- **Next:** WP-33 (onboarding kit; includes the kill-switch drill on Railway with a real timer), WP-31 (security hardening). WP-28 stays blocked on Alaris's documentation.

## 2026-11-23 · WP-40 follow-ups: rotation keeps the daily-limit count
- **Done:** the daily limit of new customers, the count and waiting messages on the Settings card, and the last delivery report now follow the number's rotation chain, not one account id (a token renewal used to restart the count; the new test fails on the old code). The template panel is titled "New template". "Card does not refresh after Check now" could not be reproduced on the live site; a regression test covers it. ADR-025 updated.
- **Remaining:** approve `messign_live_check` at Meta, then verify the template webhook and header and link-button values; operator steps from WP-29.
- **Next:** WP-30 (sandbox E2E).

## 2026-11-23 · WP-40 live check with the Meta test number
- **Done:** ran the live check on the production API and database (sandbox): the template listing, a send with its delivery report through the new account's webhook, and a campaign sent from the website (template, segment, campaign). Results are in ADR-025 ("Live check with the Meta test number"). Tools: `engage:whatsapp-check` gains `--rotate`, `--templates`, `--header-param`, `--button-param`, and reuses an existing customer that owns the number; the runbook has "Live check of templates (WP-40)".
- **Found:** the website hid the engage sections because the Vercel build had no `VITE_PRODUCT_SURFACE` (now `all`, with the platform organization enabled); the test number needs sandbox mode and a script-only allow-list; the Meta callback is one URL per app; the daily-limit count restarts after a token rotation (not fixed).
- **Remaining:** approve `messign_live_check` at Meta, then check the template webhook and the header and link-button values; fix the rotation gap and two small screen bugs; the operator steps from WP-29 (alert webhook, restore drill).
- **Next:** WP-30 (sandbox E2E).

## 2026-11-23 · WP-40c Operating WhatsApp: Settings card and alerts
- **Done:** ADR-025 addendum. Settings > WhatsApp (`GET /api/engage/whatsapp/setup`): checklist, webhook URL with Copy and the fields to subscribe, last delivery report and template update, the template check with Check now and failures in words, the daily limit against customers messaged and messages waiting, the templates in use with Meta's status, WhatsApp readiness. Alerts: `whatsapp_template_unhealthy` and `whatsapp_template_check_failing` (attention items, so Settings shows them at once), `whatsapp_frequency_limited` and `whatsapp_pacing_holding` (ops rules per account); operator text and plain-English Settings text for each. `engage:add-account --whatsapp` preset with warnings for missing ids. No migration.
- **Found:** `engage:add-account` turned every number-looking config value into a JavaScript number; a 16- or 17-digit Meta id (`waba_id`, `phone_number_id`) would have lost digits. Keys ending in `_id` now stay text.
- **Tests:** server 7 integration (setup view and its HTTP route, admin-only and secret-free; missing `waba_id`, public address, account; pacing counts and the day-old hold; paused and red templates in use; unused templates not alerted; check failing three times and clearing; 131049 counted), unit for the rules, operator text and the add-account preset; client 6 (card, copy, check, failures, no account, alert texts).
- **Remaining:** the live check with the Meta test number (needs you: the runbook's steps, then results into ADR-025). Operator: migration 137, `waba_id` on the account, subscribe `message_template_status_update`.
- **Next:** WP-30 (sandbox E2E).

## 2026-11-23 · WP-40b WhatsApp in journeys, campaigns, segments and customer entry
- **Done:** ADR-025 addendum. Journeys: message steps on email or WhatsApp (template of the step's channel, checked on save, approval and activation), the engine sends WhatsApp steps through the WhatsApp account; activation refuses a template Meta would not take, and a marketing template on a transactional step. Branches may read `consent.<channel>` and `reachable.<channel>`; the editor has a "WhatsApp, else email" preset. Segments: `consent.whatsapp`, `contact.email`, `contact.phone`. Campaigns follow the template's channel (WhatsApp consent and a number; readiness per channel; `template_not_sendable`; results show messages waiting for the daily limit). "Add customer" records WhatsApp consent with evidence. Templates: create and version WhatsApp templates in the app, filled in from what Meta lists. Copy drafts stay with email steps. No migration.
- **Tests:** server 11 integration (fallback journey end to end: WhatsApp to the reachable customer, email to the one without consent, without a number, or stopped, once each; channel mismatch; activation by Meta status and mode; segments; WhatsApp campaign once, without public links, refused when paused, paced past the daily limit; customer entry), 5 definition and evaluator unit; client 9 (campaign, customer form, editor channel and preset, WhatsApp template form, journey form).
- **Remaining:** 40c (Settings WhatsApp card, ops alerts for templates, the live check with a Meta test number).

## 2026-11-23 · WP-40a WhatsApp templates in the platform (foundation)
- **Why:** WP-27 could send a WhatsApp template, but no screen, journey, campaign or template in the product could use it; nothing owned that work. Plan for all of WP-40 in `docs/roadmap/wp-40-whatsapp-plan.md` (three PRs); this is the first.
- **Done:** ADR-025. Migration 137 (`templates.channel` allows whatsapp; `whatsapp_template_versions`, `whatsapp_template_status`, `whatsapp_template_events`, `whatsapp_template_checks`, `whatsapp_sync_work` ids only). Registration of how a Meta-approved template is filled (`/api/engage/templates` with `channel: whatsapp`; versions, preview with a real customer, health). Pure renderer. Template check (Meta's listing, all pages; hourly job and on demand) and the `message_template_status_update` webhook, both feeding a per-tenant mirror with history. Gate rules: `template_not_approved`, `template_status_unknown` (live), `template_mapping_mismatch`, `template_category_mismatch` (a marketing template is never transactional), `content_no_opt_out`; account pacing (`account_pacing` defers, `account_limit_reached` refuses what would expire). Adapter: header and URL-button values, template listing; mock Graph API extended. Client: WhatsApp templates labelled in the list, read-only detail with Meta status and value sources, kept out of the email pickers.
- **Found:** the 24-hour default message lifetime would have let every paced WhatsApp message expire as it became sendable; WhatsApp template messages now live 3 days and the gate refuses at once what would expire. Postgres caps regex repetition at 255, so Meta's 512-character template names are checked by length.
- **Tests:** 45 unit, 19 integration (registration API, check with paging and failures, status webhook signed, in order and idempotent, every gate rule end to end through the dispatcher, pacing, isolation), 2 client; isolation suite lists the four tables and `whatsapp_sync_work`.
- **Remaining:** 40b (journeys, campaigns, segments, consent capture), 40c (Settings card, ops alerts, live check). Operator: migration 137 with `npm run db:migrate`; `waba_id` on the WhatsApp account; subscribe `message_template_status_update` in Meta.

## 2026-11-23 · WP-29 Ops: provider health, alerts, error tracking, restore check
- **Done:** ADR-024 and `docs/runbooks/ops-monitoring.md`. Migration 136 (`engage.ops_alerts`, `engage.ops_work` ids only, indexes for the recent-history windows). `engage/ops/`: snapshot (measured per tenant under RLS), pure rules (failing provider, rejected credentials, delivery reports missing, bounce and complaint rates, gate-denial setup problems and spikes, stuck messages, stuck trigger outbox, the tenant attention items), alert lifecycle (open, escalate, remind, resolve), one digest per run to `ENGAGE_ALERT_WEBHOOK_URL`, optional heartbeat, dead-letter depth of the engage queues, in-process error tracking (engage job handlers and every engage `logError`), restore check. Job `engage/ops-check` every five minutes. Settings: open alerts under "Needs attention", a "Delivery health" card. Scripts `engage:ops-report`, `engage:ops-drill`, `engage:restore-check`.
- **Tests:** 17 unit and 14 integration (the drill on real Postgres and HTTP: credentials rejected, failing calls, no price, missing reports, stuck messages, a real HTTP webhook, a webhook that is down, isolation, Settings routes, restore check including tampering), 3 client; the isolation suite lists `ops_work` and `ops_alerts`.
- **Restore drill (local, 2026-11-23):** `pg_dump -Fc` of a 470 MB PostgreSQL 17 database took 30 s, `pg_restore` 1 min 50, all checks passed, counts identical to the live manifest.
- **Remaining:** set `ENGAGE_ALERT_WEBHOOK_URL` and `ENGAGE_OPS_HEARTBEAT_URL` on Railway and run `engage:ops-drill`; run the restore drill against Railway's backups (D-17); thresholds are first guesses to tune with real traffic. SMS health follows when WP-28 has an adapter.
- **Next:** WP-30 (sandbox E2E). WP-28 stays blocked on Alaris's API documentation.

## 2026-11-22 · Webhook URLs follow rotated accounts
- **Done:** a provider's callback URL contains the account id, and rotation creates a new id, so rotating credentials broke the URL Meta (and the SES SNS subscription) held. `engage/webhookAccount.ts` now resolves the URL's account to the active account of the same `supersedes_id` lineage; the handshake and signature use that account's secrets, so rotated-out secrets stop working. Tests: `engageWebhookRotation.integration.test.ts` (chain of rotations, changed number, revoked lineage, another provider, tenant isolation). ADR-023 addendum and both runbooks updated.
- **Remaining:** Meta's callback is one URL per app (several numbers or tenants under one app need a design); a real WhatsApp number; wording for a new template.
- **Next:** WP-33 (onboarding kit).

## 2026-11-22 · WP-27 live check with a Meta test number
- **Done:** the live check passed for sending, the webhook handshake and signature, delivery reports, a STOP reply (revoked, suppressed, recorded without text or number) and the gate blocking the next marketing send. Details in ADR-023. `npm run engage:whatsapp-check` (prepare, send, report, and `--webhooks --subscribe`); PR #56.
- **Found:** delivery reports needed the app subscribed to the WhatsApp Business Account itself, not only a callback and fields; now a runbook step and a script mode.
- **Remaining:** Meta's `user_preferences` stop and error 131050 need a marketing-category template; the sender name and logo (the test number's profile cannot be edited) need a real number registered to the account, with the display name approved by Meta (Dora logo prepared); the message wording needs a new template approved by Meta; a permanent system-user token before anything lasts longer than a day.

## 2026-11-22 · WP-27 WhatsApp Cloud API adapter
- **Done:**
  - ADR-023 and `docs/runbooks/whatsapp.md`. Built from Meta's **official** documentation (developers.facebook.com, read 2026-11-22). Migration `135_engage_inbound_events.sql` (`engage.inbound_events`: one row per customer message or preference change, by Meta's id; no text, no number; append-only).
  - `engage/whatsapp/`: the adapter (Messages API, approved templates with positional variables, text inside the 24-hour window; error codes read as `wa_<code>`, retried or final as in Meta's table; not idempotent, documented), the rules (`format.ts`: signature, handshake, webhook parsing, opt-out words, error classes), inbound handling, and a mock Graph API with Meta's webhook payload builders. Provider `whatsapp_cloud` registered with the other adapters; contract extended with `parseInbound`, `verifyWebhookChallenge` and an opt-out flag on errors and events.
  - Webhooks: `GET /api/engage/webhooks/:accountId` answers Meta's handshake; `POST` verifies `X-Hub-Signature-256` over the exact bytes, applies sent, delivered, read (as delivered) and failed reports once whatever Meta retries, and reads customers' messages and preference changes.
  - **Every way a customer says stop is honoured:** a STOP-like message (whole message, Turkish or English), Meta's `user_preferences` stop, and error 131050 (on the send or in a failed status) revoke WhatsApp consent (source `stop_keyword`) and suppress the number for WhatsApp; email and SMS are untouched; a `resume` is not a grant.
  - **A bug found on the way:** the server's JSON parser consumed `application/json` bodies before the webhook route, so every WhatsApp webhook would have been refused (SES worked because SNS posts `text/plain`). `engage/jsonBodyParser.ts` leaves `/api/engage/webhooks/` alone; the test app uses the same parser.
  - Gate: marketing needs a template (as before) and now `content_template_invalid` for a name WhatsApp could not have. Acceptance, with the real gate: a customer with email and SMS consent but no WhatsApp consent is blocked (`no_consent`), with it the template is sent to the mock. Breaking the gate's consent rule or the parser makes the tests fail.
  - Tests: 28 integration, 36 rules unit, 17 adapter-against-mock. Two existing tests changed on purpose: the route-guard check now expects the two `/webhooks/:accountId` routes (POST and the GET handshake), and the webhook test that expected a JSON body parsed upstream to be refused now expects it to be read as exact bytes. Server 2167 pass / 9 skipped (198 files), `tsc` clean; no client change.
- **Remaining:** **the mock follows Meta's documentation, not Meta: the first live check with a Meta test number is the first onboarding step** (runbook). Customers who use a WhatsApp username may reach us only with a business-scoped user id, so their STOP cannot be matched (recorded as unmatched). Not done: journeys that send WhatsApp (the message step is email only), template management from Messign, a Settings screen, media and interactive messages. Migration 135 needs `npm run db:migrate` on the development database.
- **Next:** WP-33 (onboarding kit), with the WhatsApp, İYS and email items in one checklist.

## 2026-11-22 · Engage screens: date-attribute journeys, İYS card, "needs attention"
- **Done:**
  - **Journey form:** a trigger "Around a date in the customer's record" with the attribute, the days from the date (negative is before) and the local time. Re-entry is fixed at "enter again" with the reason shown, and the saved definition always says `after_exit` (the server requires it). Opens existing date-attribute journeys instead of sending them to JSON.
  - **Settings > İYS:** the account (provider, mode, İYS and brand numbers; never credentials), health, opt-outs waiting for İYS (late, near the limit, past it), reported, skipped, refused, how fresh the pull is, and a Check connection button that shows İYS's own code. Without an account it says the credentials are added by the Messign contact and never typed in the browser.
  - **Needs attention:** `GET /api/engage/settings/attention` (admin) derives items from existing state, nothing stored: the email domain lost by the scheduled re-check (the domain and what failed) and the İYS sync late, at risk, refused or stale. Shown first on Settings, in words, and as a red or amber dot on the Settings tab; gone when the cause is. ADR-020 point 9.
  - Tests: 10 server integration (attention), 3 form, 1 editor flow, 8 Settings (İYS card, attention card, dot, not asked for non-admins, a refused request gives no dot). Server 2086 pass / 9 skipped, client 708 pass, both `tsc` clean. No migration.
- **Remaining:** no email or other message to the tenant (needs a Messign sender identity: a separate decision); the date runs and İYS pushes are not listed in the UI (only counted); the scheduled check clearing the email item because the account is gone is not an alert (the admin did that).
- **Next:** WP-27 (WhatsApp) then WP-33 (onboarding kit), so the checklist includes the WhatsApp items once.

## 2026-11-22 · WP-26 İYS client, mock İYS and sync
- **Done:**
  - ADR-022 and `docs/runbooks/iys-sync.md`. Built from İYS's **official** API documentation (apidocs.iys.org.tr, 3.2.4, read in the browser: the page is built client-side, so a plain fetch sees nothing). Migration `134_engage_iys_sync.sql`: channel `iys` for channel accounts (the tenant's own İYS number, brand number, API user and password, encrypted like every credential; one active per tenant; can carry no message), `engage.iys_outbox` (push queue, filled by a trigger on the consent ledger in the opt-out's own transaction), `engage.iys_changes` (each pulled movement once, no address), `engage.iys_sync_state`, `engage.iys_sync_work` (ids only, on the isolation allow-list).
  - `engage/iys/`: client (token and refresh, brands, the idempotent v2 add-consent, the movement listing with `after`; İYS's error codes, `X-Trace-Id`, per-second and hourly limits), `sync.ts` (push: every documented answer ends a report as sent, skipped or failed, with backoff and the three-business-day limit; pull: applied as source `iys`, newest decision wins, the marker moves with its page), `report.ts` (SLA monitor), `job.ts` (every ten minutes), `mock/mockIysServer.ts` (the same specification, with its validation and error codes), `npm run engage:iys-mock`.
  - `GET /api/engage/settings/iys` (connection and SLA report, never credentials) and `POST /api/engage/settings/iys/check`, admin only.
  - Acceptance, against the mock: a recipient revokes in İYS, the pull applies it, and the real send gate blocks the queued message (`no_consent`) while a bystander's is sent; an opt-out recorded locally is queued with its record and reaches İYS. Breaking the revocation mapping on purpose fails the acceptance test.
  - Tests: 45 integration, 19 client against the mock, 8 format and 5 report unit. Server 2085 tests, client 696, both `tsc` clean.
- **Remaining:** **the mock follows the documentation, not a real İYS: the first live check with a tenant's sandbox credentials is the first onboarding step** (runbook). The opt-out source values we report (`HS_EPOSTA`, `HS_MESAJ`, `HS_WEB`, `HS_EORTAM`) are a reading of the documented definitions and need confirming with İYS. Not done: pushing grants, the reconciliation file and the first import of what İYS holds, a gate rule while the pull is stale, a Settings screen, an alert beyond the report, a readiness item for the tenant's IP registration with İYS. İYS's limits are per IP, shared by all tenants on this server. Migration 134 needs `npm run db:migrate` on the development database.
- **Next:** WP-33 (onboarding kit), or WP-27 (WhatsApp).

## 2026-11-21 · WP-25 Date-attribute trigger and florist occasion reminder
- **Done:**
  - ADR-021. Migration `133_engage_date_attribute_runs.sql`: `engage.date_runs` (one claim row per journey and local day, counts, keyset cursor, guard against changing a finished run, forced RLS, no delete), enrollment trigger kind `date`, and `engage.due_date_work` (ids only, added to the isolation allow-list).
  - `engage/journeys/dateTrigger.ts`: a run once per local day at `at_local_time` of the tenant's zone; enrolls customers whose date attribute (month and day, any year) is `offset_days` away, with the key `date:<occasion day>:<customer>`, so once per occurrence and again next year. Latest due day only (missed days are not made up), first run after activation, 29 February celebrated on 28 February in a year without one, values matched as text (garbage never matches or errors), erased customers excluded. The tick and the tenant tick run it; summaries gain `dateRuns`.
  - A date-attribute definition must use `re_entry: after_exit` (otherwise next year's occasion would be refused silently).
  - `engage/journeys/occasionReminder.ts`: the florist reminder (template `occasion-reminder`, one marketing email, holdout 10%) installed as a draft journey `occasion-<attribute>`; `npm run engage:install-occasion`. `GET /api/engage/journeys/:id/date-runs`.
  - Tests: 17 integration (a whole year of 365 daily runs on 60 customers plus leap days, garbage values, an erased customer and a second year; repeats and two workers; lease takeover; offsets; local time and time zone; missed days; cap; tick filters; isolation; the installer; the template message; API; guards) and 10 unit. A deliberate break of the leap-day rule fails the year test. Seeder and foreign-key index added for the new table. Server 2000 pass / 9 skipped (190 files), client 696 pass (118 files), both `tsc` clean.
- **Remaining:** the journey form on the Lucy page cannot create a date-attribute journey (an admin needs the operator script or the API); nothing is shown for date runs in the UI; one journey per attribute. Migration 133 still needs `npm run db:migrate` on the development database.
- **Next:** WP-26 (İYS client and mock server), or WP-33 (onboarding kit).

## 2026-11-21 · WP-39 follow-up: scheduled email domain re-check
- **Done:**
  - Migration `132_engage_email_domain_recheck_work.sql`: `engage.email_domain_recheck_work(limit, orgs)`, a `SECURITY DEFINER` list of organization ids whose item is set and whose latest check is over 23 hours old (over 1 hour if it could not reach DNS). Added to the reviewed list in the isolation test.
  - `recheckEmailDomain` and `recheckDueEmailDomains` in `engage/settings/emailDomain.ts`, and an hourly pg-boss job (`engage/email-domain-recheck`, `emailDomainJob.ts`, registered in `index.ts`). A pass renews the item, a real failure removes it, and a check whose only failure is `lookup_failed` keeps it and is tried again within the hour. An account that is gone or doubled removes the item; an account moved to another domain is checked on that domain.
  - Evidence rows of the scheduled check have `checked_by` empty; the Settings card says "checked automatically". ADR-020 point 8, runbook and backlog updated.
  - 11 new integration tests; one existing test (isolation allow-list) updated. Server 1974 pass / 9 skipped (188 files), client 696 pass (118 files), both `tsc` clean.
- **Remaining:** an alert to the tenant when the item is removed (no email or in-app notice yet); trying the Email domain card in a browser (needs a tenant admin account). Migration 132 still needs `npm run db:migrate` on the development database.
- **Next:** WP-25.

## 2026-11-20 · WP-39 Email domain authentication check
- **Done:**
  - ADR-020. Migration `131_engage_email_domain_checks.sql`: `engage.email_domain_checks`, forced RLS, append-only (the engage role can read and insert, not update or delete).
  - `engage/settings/emailDomain.ts`: for the domain of the one active email account's From address, a read-only DNS lookup of SPF (exactly one `v=spf1` TXT), DKIM (a CNAME or a TXT with a key at each selector the admin names, 1 to 5) and DMARC (exactly one `v=DMARC1` TXT with a valid `p=`). A failed lookup (timeout, server error) is `lookup_failed`, never a pass. No named selector is a failure. The lookups run outside any transaction; a result for an account that was replaced meanwhile is discarded.
  - `GET /api/engage/settings/email-domain` and `POST /api/engage/settings/email-domain/check` (admin, one check per ten seconds per tenant). A pass sets the readiness item `email_domain_authenticated`; a failure removes it. `PUT .../readiness/email/email_domain_authenticated` is now refused (400): the item is no longer a statement.
  - A pass older than 30 days no longer counts in live mode (gate and campaign readiness); the other readiness items do not expire.
  - Settings: an Email domain card (sending domain, DKIM selectors, Check now, what was found and what is missing) and a read-only row for the item. `send-a-campaign.md` says how to get the item.
- **Verified:** `engageEmailDomainUnit.test.ts` (37): SPF, DMARC and DKIM rules, failed lookups, inputs, what is looked up. `engageEmailDomain.integration.test.ts` (13, real Postgres, HTTP, fake DNS): pass sets item and evidence with no record text logged; failure clears it; selectors reused; invalid input stores nothing; throttle; manual record refused; account problems; account replaced mid-check; timeout is a failure; tenant isolation; append-only; 30-day expiry. `engageGate.integration.test.ts` gained the live-mode expiry test; `engageSettings.integration.test.ts` now gets the item from a check. Client `EngageSettings.test.tsx` gained 7 tests. Mutations caught: allowing a manual record, and dropping the expiry in the campaign readiness and in the gate. Server suite 185 files, 1963 tests; client 118 files, 695 tests; both `tsc` clean.
- **Not done:** no scheduled re-check or alert (a dropped record is caught when the pass expires or on a re-check); SPF includes are not followed; a From domain whose DMARC lives only on the parent domain fails; no proof that the provider may send for the domain; SMS and WhatsApp have no equivalent. Not run against a real domain's DNS (tests use a fake resolver).
- **For you:** run `npm run db:migrate` to apply 131 (additive: one new table). Nothing else changes for a tenant that is not live.

## 2026-11-20 · Custom domain and email-auth follow-ups (docs only)
- **Done:**
  - `www.messign.com` now serves the app from Vercel. The `www` CNAME at GoDaddy points at Vercel's target. A first attempt left off the final `.com.` of the target, so Vercel stayed "Invalid Configuration" until the record was corrected. Vercel shows the domain valid with its certificate, and it loads over HTTPS.
  - `docs/VERCEL_FRONTEND_DEPLOYMENT.md` has a Custom domain section (records, what not to touch, the apex still open). `docs/runbooks/ses-sandbox-setup.md` now gives `https://www.messign.com` as the example for `ENGAGE_PUBLIC_APP_URL`, and a duplicated step 7 there is removed.
  - Backlog: WP-33's onboarding checklist now includes setting the sender name and matching the email account's From name. New WP-39 (email domain authentication check: SPF, DKIM, DMARC, set the readiness item from the DNS result).
  - Earlier in this session, migrations 129 and 130 were applied to the development database (the one in `server/.env`), and the sender identity check found no mismatch: the one tenant there has no sender name set.
- **Not done:** the apex `messign.com` still points at GoDaddy's site builder, so Vercel shows it invalid. Switching it takes the site builder page down, so it waits for a yes. `ENGAGE_PUBLIC_APP_URL` on Railway still needs changing to `https://www.messign.com` before any marketing email goes out. GoDaddy's DNS page 2 (SPF, DMARC, MX) was not read.
- **Next:** WP-39 is not started. WP-25 is next in the backlog.

## 2026-11-20 · Sender name (follow-up to WP-24; not a backlog WP)
- **Done:**
  - Migration `130_engage_sender_name.sql`: `engage.tenant_settings.sender_name` (1 to 80 characters, one line, no `< > { }`, trimmed; the database enforces it).
  - `{{sender_name}}` is a system variable, like `{{unsubscribe_url}}`. It is filled from the tenant's setting when a message is made and in previews. Without a name the render is refused (missing variable), so the send gate denies the message. No fallback is allowed.
  - `PUT /api/engage/settings/sender` (admin): trims, refuses markup, braces, line breaks and more than 80 characters, with the field named. Settings view shows `senderName`.
  - Copy drafts may use `{{sender_name}}` in a sign-off, for both purposes. The prompt tells the model to write that placeholder and nothing else.
  - Client: a Sender name card in Settings (with a "not set" warning), and the template form's hint mentions the placeholder.
  - One sender identity: the send gate denies an email (`sender_identity_mismatch`, rule `sender`) when the channel account's From display name (`from_name`) and the tenant's sender name are both set and differ. Quotes and whitespace do not count. Before this, a message could be signed with one name and sent from another. `sanitizeDisplayName` is shared by the adapter and the gate, so they compare the same text. The client decision text covers the new code.
- **Verified:** `engageSenderNameUnit.test.ts` (10): the placeholder renders, is refused when missing, cannot have a default; drafts may use it; input rules. `engageSenderName.integration.test.ts` (5, real Postgres, HTTP): admin only; another tenant has no name; refusals with the field named; the database refuses markup even when bypassed; a message carries the name, or a render error without one; the preview names the missing variable. A mutation that invents a fallback name is caught by the preview and message tests. Client: `EngageSettings.test.tsx` gained two tests (save, refusal). Identity: three unit tests in the same file. `engageGate.integration.test.ts` gained a real-Postgres test: a mismatch is denied, a match and an account with no From name are allowed. A mutation that disables the rule fails that test. Server and client `tsc` clean.
- **Not done:** the sender name is one name for the whole tenant; no per-template sender (it would add a second identity, the thing this closes). The sending domain is not checked: `email_domain_authenticated` is still a manual readiness attestation. Real SPF/DKIM/DMARC checks belong to the email verification work (its own WP, not started). A tenant without a name cannot send any message that uses the placeholder until it is set.
- **For you:** run `npm run db:migrate` against production to apply 130 (additive: one nullable column). Each tenant admin then sets the name in Settings. Check each email account's `from_name` matches the tenant's sender name, or the gate will deny those emails.

## 2026-11-20 · WP-24 follow-up (approval panel for AI copy drafts)
- **Done:** a copy drafts panel in the Lucy page's Templates section (`CopyDraftsView.tsx`): a count of drafts waiting, the queue by status (waiting, approved, rejected), each draft's subject and copy in a sandboxed frame with its brief, and approve or reject for tenant admins. Admins also ask for a draft: journey, one of its message steps (only the steps, from the latest version), language and brief, with the brief's length checked before sending. A refusal shows each reason in words (`copyDraftText.ts`), and nothing is saved. Approval reports the new template version; a step that pins a version is told so.
- **Verified:** `CopyDrafts.test.tsx` (11 tests): the reason texts, the message-step list, the brief rule, the queue for admins and for members (no decision buttons, no ask form), approve and reject calls, the request body, the refusal list, the count on the Templates entry. `tsc` clean.
- **Not done:** a real-model quality check. This environment has no model key (`server/.env` is absent), so no draft was produced by a real model. A message step in the journey editor does not link to drafting yet; drafting starts from the panel.
- **Next:** WP-25 (date-attribute trigger and florist occasion template).

## 2026-11-20 · WP-24 (AI copy drafting for message steps, gatekeepers, approval queue, no PII)
- **Done:**
  - Migration `129_engage_copy_drafts.sql`: `engage.copy_drafts` (one proposed template version per message step; forced RLS). Content is fixed at insert; the engage role can update only the decision columns, and cannot delete.
  - `engage/copy/copyDraft.ts`: `POST /api/engage/copy-drafts` (admin) takes a journey id, a message step id, a brief and a language (`tr` or `en`). It reads the step's template, purpose and pin and the trigger's event name, and no customer data. The brief is screened for personal data. The prompt is built from fixed text, the purpose, the event name and the brief, and is screened once more before the call. The call goes through the existing gateway (`generateText`, tier `complex`, metered by WP-23, budget checked first). The answer must be one JSON object and must pass the gatekeepers. What passes is queued as a pending draft.
  - Gatekeepers, all returning codes and never the copy: personal data in the output (by kind); the template renderer's rules (`checkTemplateContent`, now exported); a variable allowlist (`first_name` with a fallback, and `unsubscribe_url` for marketing only); the unsubscribe rule (marketing must have it, transactional must not).
  - `GET /api/engage/copy-drafts[/:id]` (any engage user, optional `status`), `POST .../:id/approve` (creates the next template version in the same transaction as the decision, through `addTemplateVersionOn`), `POST .../:id/reject`. Approval and rejection happen once (409 after that).
  - `gateway.ts` re-exports `AiBudgetExceededError`, so engage imports the error through the gateway, which the import lint allows.
  - ADR-019 records the decisions.
  - Second real-model run: no invented links and no repeated greeting, but the copy referred to a button and to links that do not exist, signed off with an invented team name, and made claims about demand and stock the brief did not give. Added the gatekeeper codes `link_reference` and `sender_name`, and prompt rules on sender names, links and claims. Still open: the sender's name is to be set by the tenant (a sender setting and template sign-off), which is a follow-up work package, not done here.
  - Real-model check (2026-11-20, five briefs, Claude through the gateway): all five passed the gatekeepers, but reading the copy showed two defects, now fixed with tests. The model wrote an invented shop address (`https://www.example.com/cart`) and a bare path (`/sepet`), and it repeated the greeting before the first-name placeholder ("Merhaba Merhaba"). Two new gatekeeper codes: `link_not_allowed` and `greeting_repeated`; the prompt now says where the greeting and links go. Re-run the check to see the effect; the gate now refuses these cases regardless of the model.
  - Deeper pass (same session): the detector now reads text after NFKC normalisation and with invisible characters removed (full-width digits, zero-width spaces); it catches spelled-out emails ("ayse [at] example [dot] com", "ayse at gmail dot com"), Turkish-domain emails, dotted phone groups and national ids typed in groups. A model-call failure logs the error's name and status only, because a provider's error text can echo the request.
- **Verified:**
  - **PII-in-prompt test** (`engageCopyDraftPii.integration.test.ts`, real Postgres 17 with pgvector, HTTP, model stubbed to record prompts): two customers with names, emails, phones and an address exist; no name, email, phone, address or profile id reaches the system or user prompt, and the brief and event name do. Plus: personal data in the brief refused before any model call; personal data in the reply refused by kind and nothing stored; marketing without the unsubscribe link and transactional with it refused; a non-JSON reply, a model error (502, the error text not echoed) and a budget refusal (402) store nothing; non-admins get 403; approval adds version 2 and the template's latest version carries the drafted subject; a second decision gets 409; a rejected draft never becomes a version; tenant B cannot read, approve or reject tenant A's draft; no message row is created.
  - **Mutations** on the real path, both caught: a profile's attributes added to the prompt (the PII test fails); the brief screen disabled (the brief test fails).
  - `engageCopyDraftGates.unit.test.ts` (43): detector shapes (email, TR phone forms, TR IBAN, 11-digit id, Luhn card), ordinary copy not flagged, the gatekeeper rules one by one, the output parser.
  - Isolation suite and schema-index suite cover `copy_drafts` (seeder registered).
  - Full server suite on a scratch Postgres 17 (port 5499, not the local messign database): 181 files passed, 2 skipped, 1885 tests passed, 9 skipped. Server `tsc` clean. Full client suite: 117 files, 675 passed. Client `tsc` clean.
- **Not done:**
  - Number words ("beş üç iki") and other spelled-out digits are not detected.
  - No UI. The API is the queue; a panel on the Lucy page would be a separate package.
  - Names and street addresses typed into the brief are not detected (no reliable shape). The design keeps profile data out of prompts, but the admin must not type customer names into a brief. The PR says so too.
  - Quality of drafted Turkish copy has not been judged; no real model call was made in tests (the model is stubbed).
  - A step that pins a template version keeps that version, so an approved draft reaches it only after the journey points at the new version. The draft response reports the pin.
  - Self-approval is allowed (D-13 open), as for journeys.
  - Copy is not checked for compliance claims beyond the system prompt's instruction; brand words and tone rules are not enforced.
- **For you:** run `npm run db:migrate` against production to apply 129 (additive: one table, its policy and grants; no data touched). No environment variable is needed; the AI budget applies as it does elsewhere.
- **Next:** WP-25 (date-attribute trigger and the florist occasion template). If you want drafting in the Lucy page, that is a new work package.

## 2026-11-14 · Marketing counter MC-06
- **Done:** The picture step keeps look, frame, and the Ultra reference warning. The scene line is the sentence Fal receives. Regenerating an offer uses the look saved on that offer, even when the request asks for another. Client and server tests passed. Dora’s offer was opened in the browser. Regenerate was not clicked.
- **Next:** MC-07. The journey email sits on the offer: subject, product, price, window, unsubscribe. The builder is only for layout.
- **Blockers:** none for MC-07. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Marketing counter MC-05
- **Done:** An empty shop is a card with New offer. A failed list shows the error and Try again. Switching shop clears a product that is not on that list, including the shot lines, and returns to Product. An open offer that is not on the new shop closes. Kitapyurdu shows Kürk Mantolu Madonna and not Dora. Client tests passed. The switch was checked in the browser without saving.
- **Next:** MC-06. Picture step keeps look, frame, reference, and regenerate. The scene line matches the Fal sentence.
- **Blockers:** none for MC-06. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Marketing counter MC-04
- **Done:** The home and the offer use one paper background and one white card. The still is the large part of the card. The home has no violet glow, paper-plane burst, or zeroed stats. Pipeline and the other rooms were left as they were. Client tests passed. The counter and Dora’s offer were checked in the browser.
- **Next:** MC-05. Empty, error, and tenant-switch states. Switching shop clears a product that is not on that list.
- **Blockers:** none for MC-05. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Marketing counter MC-03
- **Done:** Opening an offer from the counter shows the product, the still, and the caption. The score, hashtag tools, timing tools, and the Instagram access-token field are off that screen. Publish stays off, with no share button. Client tests passed. Dora’s offer was opened in the browser: the still and caption were on the panel.
- **Next:** MC-04. Shop-window theme on the home and the offer. One background, one card, the still large.
- **Blockers:** none for MC-04. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Marketing counter MC-02
- **Done:** New offer is five steps at `/marketing/offer/new`: product, picture, words, preview, Looks good. A product drop cannot leave Product without a product. Cart skips the picture. Looks good saves a draft and does not schedule, post, or ask Lucy. The Instagram create modal is no longer opened from the counter or from Lucy. Client tests passed. The page was walked in the browser through Looks good without saving.
- **Next:** MC-03. The content slide-over opens this same offer. Token, score, hashtags, and timing leave it.
- **Blockers:** none for MC-03. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Marketing counter MC-01
- **Done:** `/marketing` is the shop counter. It lists offers for the selected shop, with the still, price, and step. Lucy stays closed until Ask Lucy. More still opens pipeline, calendar, builder, intel, brand, funnel, campaigns, and sandbox, unchanged. New offer opens the existing form and was closed without sending. Kitapyurdu shows Kürk Mantolu Madonna. Lilyana shows Papatya buketi. Messign shows Dora and does not show the book. Client tests passed.
- **Next:** MC-02. New offer becomes five steps, and the create modal stops being the way in.
- **Blockers:** none for MC-02. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Marketing counter roadmap
- **Done:** The 120-day shop-counter plan is in `docs/roadmap/marketing-counter-120-day.md`. Every current marketing tab has a fate. Eighteen packages, MC-01 through MC-17, are on the backlog. The home becomes an offer list. Lucy becomes a drawer. The create modal and the content detail become one offer page. Calendar, builder, brand, campaigns, and intel are later rooms. Sandbox and the old redirects leave the nav. No screen was rebuilt in this session.
- **Next:** Engage WP-02. The first counter session, if this track is chosen, is MC-01.
- **Blockers:** none on the document. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Still look on the form
- **Done:** The create form has a Look menu with all ten image looks: photoreal, modern noir, vibrant lifestyle, minimal flat-lay, editorial, product spotlight, team culture, data visualization, seasonal, and phone camera. The scene sentence opens with the chosen look, and that look is the style sent with the still. An empty look stays photoreal. “AI” in a materials line stays capitalized. Regenerate offers the same ten looks. Sheet and scene tests passed. No new Fal call.
- **Next:** Engage WP-02.
- **Blockers:** none on this package. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Aim the still from the form
- **Done:** The offer sheet now keeps `materials`, `in_frame`, and `keep_out`. Those lines do not open the truth gate. The Fal scene leads with the physical object, names the product as the title, then the shop, then the shot lines. A price or a claim in those lines is dropped. An empty materials line still falls back to the truth-row prose. The create form is Offer, Picture, and Copy. The live scene line matches the sentence Fal receives. A picked book fills materials, place, and price, and the visual box becomes caption direction. Cart hides the picture block. A product drop with no product still does not start. Sheet, scene, modal, and detail tests passed. Client and server typechecks are clean. No new Fal call, schedule, or publish.
- **Next:** Engage WP-02.
- **Blockers:** none on this package. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Content production: two real drafts
- **Done:** CP-10. Bookstore offer `34c309d2-7dc9-425c-ab67-a7b8e90f4e51` is a square Flux Pro still of Kürk Mantolu Madonna at Karaköy kitapçı vitrini, with a Turkish caption, sheet price ₺189, and an unsubscribe line on the email. Florist offer `b6a42c85-2cc5-4b06-916d-f29e9db2cc10` is Papatya buketi at Nişantaşı çiçekçi tezgahı, window 2026-11-16..2026-11-22, email price ₺450. Ultra reference strengths 0.15, 0.4, and 0.7 were tried. **0.7 kept the bouquet.** No strength kept a shop counter, because the reference frame had none. The saved florist still is the 0.7 try. Both offers have a truth id. Stored Fal prompts name the product and the place and do not contain the price. Each still has a seed and a Fal request id. Nothing was scheduled or published. Awkward: the book still became a crowned woman among flowers; book spines had broken lettering; the daisy became a large pink flower; 0.15 painted a broken shop sign; 0.4 painted poster text. Remote storage was unreachable, so the files are local.
- **Next:** Engage WP-02. This content-production track is through CP-11.
- **Blockers:** none on this package. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Content production: studio sheet
- **Done:** CP-09. The create form picks a product from the content tenant. A picked row fills price and place. Price and claim stay read-only. A product drop with no product does not start, and the error names the product field. Occasion keeps the Instagram checkbox. Cart hides format and place. A reference photo is marked as the Ultra path. The detail panel shows the sheet, the scene sent to Fal, and the prompt Fal returned. The saved brief is the sheet. A matching fixture id passes the offer gate. Client tests passed. Server typecheck is clean.
- **Next:** CP-10 (two real drafts) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Content production: email from the sheet
- **Done:** CP-08. The journey email is built from the parsed sheet. Subject is the offer title. Preview is the claim, or the intent when the claim is empty. Product and window are copied when they are set. A filled price writes one price line. An empty price writes none, even when the intent mentions ₺1. The Instagram caption is not in the body. A cart reminder still creates no Instagram row and keeps the opt-out line. Email and cart tests passed. Server typecheck is clean.
- **Next:** CP-09 (studio sheet) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. Studio still saves a raw topic until CP-09. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Content production: story and reel
- **Done:** CP-07. A story saves 3 to 5 on-screen lines at 9:16. A reel pre-fills from the sheet: shot 1 names the product, the cover prompt names the product and the place, and a claim becomes the hook. The cover request is 9:16 at 1080x1920. Two shots do not save. Five shots round-trip. The export lists the cover URL, hook, shots, caption, and audio. No video file. Reel tests passed. Server typecheck is clean.
- **Next:** CP-08 (email from the sheet) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. Studio still saves a raw topic until CP-09. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Content production: carousel roles
- **Done:** CP-06. Each carousel slide stores a role and a claim. The roles are cover, product, detail, proof, and close. Five role prompts each name the product and leave the price out. A sixth slide is rejected. Regenerating one slide leaves the other image URLs in place. Slides use the Pro still request. A returned prompt that omits the product does not replace the slide. Carousel tests passed. Server typecheck is clean.
- **Next:** CP-07 (story frames and reel shots) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. Studio still saves a raw topic until CP-09. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Content production: feed package
- **Done:** CP-05. A labeled feed sheet is saved only when Fal’s returned prompt still names the product and the place, the frame is square, and the caption stays under 2,200 characters with “Link in bio”, no raw URL, and no second price. A dropped place does not save the image. Regen sends the sheet scene again. Alt text from `[ALT_TEXT]` stays on `visual_description`. A plain topic still saves. Story and reel skip this check. Package tests passed. Server typecheck is clean.
- **Next:** CP-06 (carousel roles) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. Studio still saves a raw topic until CP-09. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-13 · Content production: Fal Pro and Ultra
- **Done:** CP-11. Flux Pro requests omit guidance, steps, and the negative prompt. Ultra requests use `aspect_ratio` and never `image_size`. A reference photo selects Ultra and sends `image_url`. A shop still sets `raw`. A product in the scene turns enhancement off. A returned prompt that drops the product or the place is retried once and then rejected. An unsafe flag does not attach an image. A Pro size error snaps onto a multiple of 64. Flux Dev keeps guidance and steps, with `acceleration: "none"`. Returned prompt, seed, size, and request flags are stored on the image metadata. Kontext remains the edit path. Fal tests passed. Server typecheck is clean. No live Fal call.
- **Next:** CP-05 (feed package checks the prompt Fal returned) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. Studio still saves a raw topic until CP-09, so that create path has no product or place for the scene check. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-13 · Content production: scene from the sheet
- **Done:** CP-04. `buildDirectInstagramFalPrompt` builds the still from the product, the truth-row materials, and the place. A bland topic and the raw sheet are not the scene. The prompt has no price, claim, audience, or dates. A bookstore or florist place adds that shop line. Lucy’s system prompt gets the same facts, and the caption language follows the sheet. A brief with no product or place still uses the cleaned image prompt. Prompt-builder, feed, and strategist tests passed. Server typecheck is clean. No live Fal call.
- **Next:** CP-11 (Fal Pro and Ultra request bodies) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. Studio still saves a raw topic until CP-09, so that create path has no product or place for the scene. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-13 · Content production: offer gate
- **Done:** CP-03. `offerProductionGate` runs in the content workflow and the marketing orchestrator before the generation loop, so a blocked sheet never calls copy or Fal. A sentence with no labels still generates. A product drop with no `truth_id`, a truth id whose passed row does not match, or “50% off” / “indirim” with an empty `claim_id` returns failed with attempts 0. A complete sheet with no discount generates once. Workflow tests: 6 passed. Server typecheck is clean.
- **Next:** CP-04 (scene from the sheet) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. The studio still saves a raw topic until CP-09, so that create path is not gated yet. The caller must pass the truth row; this package does not load it. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-13 · Content production: merchant truth
- **Done:** CP-02. `listMerchantTruthProducts` reads one organization’s `marketing_product_truth` and approved claims. `internal_only` and `deprecated` stay hidden. `price:` and `place:` come out of the description; a row without a price label has an empty price. A claim tagged `truth:<id>` attaches only to that row. Kitapyurdu’s three rows are named titles. Lilyana’s bouquets now have a price and a place, and still do not name Dora.
- **Next:** CP-03 (gates before copy and Fal) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. The picker UI is CP-09. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-13 · Content production: offer sheet
- **Done:** The roadmap is in `docs/roadmap/content-production-roadmap.md`, including the Fal Pro and Ultra request rules. CP-01 parses and writes the labeled sheet in `user_brief`. A sentence with no labels stays intent only. An unknown label is ignored. A phone number in the audience and a window that ends before it starts are parse errors.
- **Next:** CP-02 (merchant truth rows) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-13 · Engage: safety and CI baseline
- **Done:** WP-01. Server typecheck is clean. CI uses Node 22 and runs the client and server unit suites. Email, LinkedIn, X, and blog stay on mock unless `SEND_MODE` is exactly `live`. The publisher cron stays off unless `MARKETING_PUBLISHER_ENABLED=1`. The server no longer accepts `X-User-Id` as a login. `db:verify-rls` prints the connecting role’s bypass status, then checks rows as `messign_app` (or `RLS_VERIFY_ROLE`). A studio Instagram share with saved credentials still posts when `SEND_MODE` is unset.
- **Next:** WP-02 (repo cleanup, `PRODUCT_SURFACE`, CLAUDE.md, README).
- **Blockers:** WP-03 still needs a schema-only dump (`pg_dump -s`).

## 2026-11-12 · Content studio: buffer
- **Done:** The five dogfood annoyances. The Instagram modal keeps Send on screen. A fresh browser shows the login form while dev sign-in runs. The modal can draft as Messign, Lilyana, or Kitapyurdu. Mock image skips the provider. The email child sits beside the post, and Test publish stays hidden while publish is off.
- **Next:** Engage WP-01. This track has no further package.
- **Blockers:** none on this track.

## 2026-11-12 · Content studio: dogfood script
- **Done:** One Playwright spec runs the Messign product drop, the florist occasion, and the bookstore cart email. Image generation is mocked. The studio shows the caption and the regen control, and the cart creates no Instagram row. The five annoyances are written under CS-15.
- **Next:** CS-15 (only those five). Otherwise Engage WP-01.
- **Blockers:** none on this track.

## 2026-11-12 · Content studio: second-tenant checklist
- **Done:** Messign and the synthetic florist each have a brand, a language, an Instagram handle, three product-truth rows, and the three recipes. Publish stays off. A florist prompt that names Dora fails before the model runs.
- **Next:** CS-14 (dogfood script and one mocked Playwright path) if staying on this track; otherwise Engage WP-01.
- **Blockers:** none on this track.

## 2026-11-12 · Content studio: partial approval and reel storyboard
- **Done:** CS-D2 is approved. Approving an email child leaves the Instagram child in draft, and the queue opens that content id. The offer header shows each child’s state. CS-D3 is approved. A reel is a cover still plus a storyboard (hook, three to six shots, on-screen lines, caption, audio note). The studio shows that package after reload. Copy exports the text and image URL. No video API.
- **Next:** CS-13 (second-tenant brand checklist) if staying on this track; otherwise Engage WP-01.
- **Blockers:** none on this track. CS-01 and CS-03 checks are closed.

## 2026-11-12 · Content studio: close CS-01 and CS-03
- **Done:** Offer reads and updates include the caller’s organization, so another org cannot load the offer. A new offer returns an id and an empty child list. Lucy’s Instagram send opens the studio on the Instagram child of that offer.
- **Next:** CS-08 stays blocked on CS-D2. CS-11 stays blocked on CS-D3. CS-13 (second-tenant brand checklist) is the next package if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending.

## 2026-11-12 · Content studio: schedule and test publish
- **Done:** Instagram calendar cells show a thumb and a format badge. The email child shows its subject and is not published to a network. Instagram controls are Draft, Scheduled, and Test publish. The button says mock or live. Unset `SEND_MODE` returns the adapter mock permalink and does not call Graph.
- **Next:** CS-08 stays blocked on CS-D2. CS-11 stays blocked on CS-D3. CS-13 (second-tenant brand checklist) is the next package if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending. CS-01 org-isolation test and CS-03 mocked-agent acceptance are still open.

## 2026-11-12 · Content studio: journey binding
- **Done:** The journey email stores `journey_template_ref` as `{offerId}:email`. The email screen says Ready for journey and that this screen does not send. A draft prompt with an email address or a phone number is refused. No provider is called.
- **Next:** CS-11 stays blocked on CS-D3. CS-12 (schedule and publish modes) is the next unblocked package if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending. CS-01 org-isolation test and CS-03 mocked-agent acceptance are still open.

## 2026-11-12 · Content studio: carousel slide regen
- **Done:** Regenerating a carousel slide updates that slide only. The hero stays slide 1 unless that slide is the one being regenerated. A sixth slide is rejected. Image variants sit in the shared studio, and choosing a caption variant still writes the post body.
- **Next:** CS-08 stays blocked on CS-D2. CS-10 (journey binding, no send) is the next unblocked critical-path package if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending. CS-01 org-isolation test and CS-03 mocked-agent acceptance are still open.

## 2026-11-12 · Content studio: three recipes
- **Done:** Product drop creates one Instagram post and one journey email. Occasion creates the email and, by default, the post. Cart creates the email only and says a public post is a different recipe. Approval no longer queues five X posts and a LinkedIn post.
- **Next:** CS-08 is blocked on CS-D2 (partial approval). CS-09 (carousel per slide) is the next unblocked package if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending. CS-01 org-isolation test and CS-03 mocked-agent acceptance are still open.

## 2026-11-12 · Content studio: journey email child
- **Done:** "Draft journey email" on an offer's Instagram post creates an email child of the offer. The draft uses the offer title and brief (product name and price when the brief states one) and an unsubscribe line. It does not copy the Instagram caption. Email review is blocked without an opt-out. Instagram review is not.
- **Next:** CS-07 (recipes: product drop, occasion, cart with no Instagram) if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending. CS-01 org-isolation test and CS-03 mocked-agent acceptance are still open.

## 2026-11-12 · Content studio: e-commerce prompt pack
- **Done:** Bookstore and florist Instagram briefs select an addendum: name the product and the place, no generic office, no invented discount, link in bio, caption language from the brand profile. Ten fixtures pass. A "50% off" claim missing from product truth fails the truth gate before the model is called.
- **Next:** CS-06 (email child from the same offer) if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending. CS-01 org-isolation test and CS-03 mocked-agent acceptance are still open.

## 2026-11-12 · Content studio: format on the first image
- **Done:** The `ig_format` tag written at create is the saved format. The first Instagram image uses it: story and reel cover are 9:16 (1080×1920), feed is 1:1 (1080×1080). Reloading the post restores that format. A later regenerate can still override it.
- **Next:** CS-05 (e-commerce prompt pack) if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending.

## 2026-11-12 · Content studio: one Instagram studio
- **Done:** Pipeline slide-over and command center both render `InstagramStudio` (journey strip, carousel preview, regen / reference / photo edit). Carousel with more than one slide shows slide controls. Regen still goes through `regenerateContentImage`.
- **Next:** CS-04 (format drives the first image) if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending.

## 2026-11-12 · Content studio: one Instagram path
- **Done:** Lucy home and the create menu both open the same Instagram brief. The visual note is optional. The content panel shows Writing → Image → Review → Ready, polls while Lucy is working, hides the email tools on Instagram, and offers labeled Looks good / Schedule / Publish actions.
- **Next:** CS-02 (one studio component) if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending.

## 2026-11-12 · Content studio: pin Lucy to an existing Instagram draft
- **Done:** Guided Instagram send creates an offer (`content_type=offer`, hidden from the pipeline) and an Instagram child, then posts `marketingContentId` on `/api/v2/ai/answer`. The marketing flow passes that id into `executeContentWorkflow` so Lucy updates the same row. The content panel opens immediately and refetches when SSE metadata returns the id.
- **Not in this slice:** unified Instagram studio (CS-02), stored aspect ratio on first image (CS-04), email child.
- **Next:** CS-02 if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending.

## 2026-11-12 · Content studio roadmap drafted
- **Done:** `docs/roadmap/content-studio-90-day.md` (CS-01…CS-15). Backlog section added. Engage WP rows unchanged. Pointer in `90-day-roadmap.md`. CS-D2 and CS-D3 left pending.
- **Defaults taken:** offer parent is `marketing_content` (`content_type=offer`); language from brand profile; Instagram publish follows `SEND_MODE`.
- **Next:** Engage WP-01 unless this track is chosen, in which case CS-01. Founder still needs to accept or reject CS-D2 and CS-D3 before CS-08 and CS-11.
- **Blockers:** none for the doc. CS-11 blocked on CS-D3 only when that package starts.

## 2026-11-11 · WP-23 (AI gateway metering and per-tenant monthly cap)
- **Done:**
  - Migration `128_ai_call_telemetry.sql`: `ai_call_telemetry` (one row per AI call: caller, tenant, kind, tier, provider, model, upstream calls, tokens in and out, latency, outcome, error class, cost estimate and whether it was estimated) and `ai_tenant_budgets` (monthly cap per tenant). No prompt, completion or error text is stored.
  - `services/ai/metering.ts`: `meterAiCall` and `meterAiStream` wrap every entry point. Nested entry points are passthroughs, so one call writes one row with the sum of its successful upstream responses. Budget check before any provider call; a refused call writes a `budget_exceeded` row and throws `AiBudgetExceededError`. Caller is the first source frame outside the gateway files (from the stack), so no call site had to change.
  - Entry points metered: `callModel`, `callModelSafe`, `streamModel`, `streamModelSafe`, `embedViaGateway` (gateway.ts), `generateResponse` (llmGateway.ts, JSON and tool path), the eight direct-fetch functions in `groqToolCalling.ts`, and the four image entry points (`generateImage`, Fal marketing generation, Fal Kontext edit, Fal Flux edit). `generateText` and `generateVision` go through `callModelSafe`.
  - `setAiTenantBudget(tenantId, usd)` sets a cap. No HTTP route or UI yet.
- **Verified:**
  - `aiMetering.unit.test.ts` (16): price estimates, caller naming, nesting, error and abort outcomes, telemetry write failure does not fail the call.
  - `aiMetering.integration.test.ts` (14, real Postgres 17 + pgvector, fake providers): a row on success, failover, every provider failing, stream, aborted stream, embedding, JSON path with a 400, direct-fetch tool path success and failure, budget refusal on the chat, JSON and stream paths, per-tenant isolation, cap raised again, DB down during write.
  - Mutation: disabling the budget comparison fails 3 of the budget tests; restored.
  - Migration runner fingerprint test updated: migration 128 adds two public tables and four indexes, which is the only public change after the baseline.
  - Full server suite on the scratch database: 179 files, 1822 passed, 9 skipped, and one failure (the migration fingerprint test above), which now passes on re-run. Server `tsc` clean. Full client suite: 117 files, 675 passed. Client `tsc` clean.
- **Not done:**
  - Budget check and telemetry insert each cost one DB round trip per AI call. Acceptable now; measure before scaling.
  - The cap can overshoot by the cost of calls in flight at the same moment. If the database cannot be read, the check fails open (logged). Refuse-on-error would stop calls when the database is down; a decision for the founder.
  - Prices are estimates in code (`PRICE_USD_PER_MTOK`), not read from the providers. Image costs are a flat per-image estimate. Streams and images have no token counts and are charged the per-tier estimate (marked estimated).
  - `services/ai/agents/*`, `v2/*` and other modules that reach the gateway are covered through the gateway, not tested one by one.
  - `ai_request_telemetry` (request-level, existing) is unchanged. It is not the same grain as this table.
- **For you:** run `npm run db:migrate` against production to apply 128 (additive: two new tables, no data touched). Then set a budget per tenant, for example with `setAiTenantBudget` from a script; no budget row means no cap, only metering.
- **Next:** review the PR stacked on #40 (`engage/settings-wp22`); then WP-24 (AI copy drafting, PII-in-prompt test).

## 2026-11-11 · WP-22 (settings: channel accounts, readiness, quiet hours, caps, send_enabled)
- **Done:**
  - **Settings tab** for tenant admins on the engage page (`SettingsView.tsx`, `settingsApi.ts`): sending switch with its reasons, readiness items (value and https evidence link), quiet hours, time zone and frequency cap, monthly budget caps, rate cards, and channel accounts (view and disable only; secrets stay in `npm run engage:add-account`).
  - **Server:** `/api/engage/settings` (admins only, `settingsRoutes.ts`, `settings/settings.ts`). `send_enabled` is turned on only if `readinessOn` (the campaign readiness, now exported) has no problems other than the flag itself. The check runs under a row lock; a refusal is 409 with the reasons. Turning it off is always allowed. Other writes reuse the gate's setters (`updateGateSettings`, `setBudgetCap`, `addRateCard`).
  - No migration: the tables already exist.
- **Verified:**
  - `engageSettings.integration.test.ts` (real Postgres 17 + pgvector, HTTP): 10 tests, including refused without readiness with the flag still off, live mode needing the legal items, admin-only, validation, and tenant isolation. A mutation that disables the readiness check makes 3 of them fail.
  - `EngageSettings.test.tsx`: 5 client tests (admin-only tab, refusal reasons shown, quiet-hours validation).
  - Full suites on the rebased branch: server 175 files, 1793 passed, 9 skipped (with `ENGAGE_TEST_ADMIN_URL`); client 117 files, 675 passed; `tsc` clean on both.
- **Not done:** SMS and WhatsApp readiness is recorded but not checked by `send_enabled` (no adapter exists yet). No audit table for settings changes; changes are logged with ids and codes only. `SEND_MODE` must be `sandbox` or `live` before sending can be switched on.
- **Next:** review PR (stacked on #39). Then the SMS/WhatsApp readiness rules once their adapters exist.

## 2026-11-10 · Local fixes after WP-38 (dev server, CORS, remount loop, customer add path)
- **Done:**
  - **Development CORS:** the local engage (3200) and merged (3300) previews are in the development allow-list (`server/src/config/corsOrigins.ts`), with a test. Before, their requests were refused and the session dropped to the login page.
  - **Remount loop (client):** on the shared (`all`) surface the engage answer gate hid the app on every refetch. A query that never succeeded goes back to `pending` on each fetch, so the app unmounted and remounted with every request it makes: hundreds per second, rate-limited (429), then logout. The answer now stands once it has arrived (`hasAnsweredEngageMe`, used by `SurfaceGate` and `useEngageAccess`). A test fails on the old condition.
  - **Add customer path:** `createCustomer` posted to `/api/api/engage/profiles` (`fetchAPI` adds `/api` itself) and got "Not found". The test matched the URL by substring and missed it; it now matches the exact path.
  - **Test setup:** `client/vitest.config.ts` pins the default surface to `workspace` for tests, so a developer's `client/.env.local` cannot change them (the login test failed on `all`).
- **Verified:** client `tsc` clean; engage client tests 81 passed (10 files); `corsOrigins` server test 5 passed. Full client suite 675 passed with the remount fix and the test default. The full server suite was not re-run on this branch.
- **Not verified:** the full server suite on this branch; the `all` surface on the dev server (blocked by the engage database configuration, see the next item).
- **Local setup, not in git:** `server/.env` and `client/.env.local` point the dev server at the `all` surface, `ENGAGE_DATABASE_URL` at `messign_local`, `SEND_MODE=sandbox`, and `ENGAGE_PUBLIC_*` at `https://messign.com` and the Railway API. Originals are in `/private/tmp/claude-501/`.
- **Open outside the repo:** the SES production access case (179435046400769) has our answer and a correction: bounce and complaint processing via SNS is not active yet and is due by the end of December. Until the SNS endpoint is set up, the code path is not live.
- **Next:** WP-22 (settings: channel accounts, readiness checks, send enabled), which replaces the manual SQL used in this session.

## 2026-11-10 · Add one customer by hand (Customers page)
- **Done:**
  - **Add customer** on the Customers section, admins only (`NewCustomerPanel`): customer ID (required), email, phone, and a "This customer agreed to receive marketing email" checkbox. Ticking it requires the email address and a note of where the customer agreed; the note is kept as the consent's evidence.
  - **Server:** `POST /api/engage/profiles` (admins; `requireEngageAdmin`), in `customerEntry.ts`. It reuses the ingestion API's profile and consent writes, so a hand-added customer behaves like one sent by a store. 201 on create; 400 with the reason or field issues; 409 when the customer ID or the email already belongs to another customer, with nothing written.
- **Verified:**
  - Server integration tests (real Postgres, HTTP): 8 tests (consent stored with the note as evidence; no consent stored without one; member refused with nothing written; consent without email or without a note refused; repeated ID and shared email refused; missing ID a field error). A mutation that removes the admin guard is caught.
  - Client: `NewCustomer.test.tsx` (6 tests: admin-only button, save rules, the posted body, opening the customer after save, server refusal shown). A mutation that removes the admin check on the button is caught.
  - Full suites: server 174 files, 1782 passed, 9 skipped (live services); client 116 files, 669 passed; `tsc` clean on both.
- **Honest caveats:**
  - The consent source is recorded as `import` with `evidence.method = manual_entry`; the admin attests the agreement by entering the note. The app does not verify the agreement.
  - The check for an existing customer ID and the write are two steps, not one transaction, so two admins adding the same ID at the same moment could both get through (the second write merges into the first). Rare; not fixed here.
  - Editing an existing customer's details is not in this change.
- **Next:** WP-22 (settings: channel accounts, readiness, quiet hours, caps, send enabled).

## 2026-11-10 · WP-38 (send one email to a segment now) and ADR-017 (tenants reach engage routes only)
- **Done:**
  - **Campaigns** (ADR-018, migration `127_engage_campaigns.sql`, `engage/campaigns/campaigns.ts`, `engage/campaignRoutes.ts`): a one-off send is a one-step `api` journey plus an `engage.campaigns` record, so every message still goes through the send gate, the holdout, the results and the customer trail. `POST /api/engage/campaigns` approves and activates the journey as the admin who pressed Send and enrols the audience in chunks (500; at most 100,000). `POST /campaigns/:id/resume` finishes an interrupted send with exact counts.
  - **Audience and safety:** only customers with email consent are enrolled. A refusal writes nothing and lists every reason (`GET /campaigns/readiness`, the preview and the 409 report the same facts): send mode off, tenant not enabled, no or two email accounts, account mode not matching the send mode, no rate card or budget cap, public https origins for the unsubscribe links missing, live readiness items missing. One idempotency key is one campaign (a double click or two simultaneous requests send nothing twice). The record's status and counts are the only columns the engage role can change.
  - **On the Lucy page:** a Campaigns tab, **Send an email now** at the top of the quick actions, a wizard in a panel (template, segment, optional holdout 0 to 50%, "Check who would receive it", confirmation, "Send now to N customers"), and a campaign panel that shows progress and what happened (delivered, blocked and why, held back) from the send gate's own decisions. Campaign journeys are not listed under Journeys.
  - **Tenants reach engage routes only** (ADR-017, `middleware/tenantGuard.ts`): an engage tenant's token is refused on every `/api` route except `/api/auth`, `/api/engage` and `/api/health`, on sockets, and on production `/uploads`. The client waits for `/api/engage/me` before showing anything and narrows the `all` surface to the engage surface for a tenant (menu, routes, socket). Any new route is closed to tenants by default.
  - **Dev sign-in:** the password stored for `client/.env.local` now matches the dev account in `messign_local` (only that one hash changed; no env file was touched).
- **Verified:**
  - **Server:** `tsc` clean; full suite 173 files, 1774 tests passed, 9 skipped (live services). New real-Postgres tests: 16 for campaigns (readiness reasons, consent-only audience, idempotent and concurrent repeats, chunked resume with exact counts, a stopped journey, outcome counts, forced RLS and column grants, no cross-tenant access) and the tenant guard (including the real routes). Mutation checks over the guard and the campaign rules; survivors (the query-string case, the skipped counter, a repeated key) each got a test.
  - **Client:** `tsc` clean; full Vitest 116 files, 668 passed, four runs in a row (16 new campaign tests; the hub, surface and gate tests cover the tenant path). Mutation checks over the wizard, the panel and the polling; the survivors (a tile not closing a panel, polling stopping too early or too late, a redundant Send condition) were turned into tests or simplified.
  - **Playwright (engage stack, 5 tests):** the new test checks the audience, confirms, sends, and opens the campaign; the four earlier tests pass again.
  - **Browser (a private copy of the dev database, merged surface, sandbox mode, mock account):** a campaign to a 30-customer segment (consent for 30, 25 allow-listed, 2 of those suppressed) ended with 23 sent and 7 blocked with their reasons, exactly the predicted counts. A tenant token on the same deployment got 403 on `/api/users` and the other Company-OS routes, and its engage page worked. Your dev database was not used for sending.
- **Found and fixed:**
  - **A tenant token could read Company-OS data** (`/api/users` and others) because only the pages, not the API, were closed to it. The deny-by-default guard (ADR-017) closes this, with its own tests; checked live.
  - A campaign without public unsubscribe origins queued messages that could not be created (30 tick errors in the first try). Readiness now refuses before anything is written.
  - The client suite failed at random under load: `findBy*` waits gave up after 1 s (one hub test, three runs in six). `asyncUtilTimeout` is now 5 s in the test setup, like `testTimeout`; four full runs passed afterwards.
- **Honest caveats:**
  - Nothing changes in production until an operator runs migration 126 and 127 (`npm run db:migrate`) and, for the platform organization, `npm run engage:platform`.
  - A campaign cannot be scheduled or cancelled once sent; there is no test send to oneself and no A/B variant (ADR-018, "Not in v1").
  - The readiness items are set by an operator (SQL and scripts, `docs/runbooks/send-a-campaign.md`) until the settings screen (WP-22).
  - With `ENABLE_PG_BOSS=false` the messages are not created until the scheduled tick runs.
  - The `all` surface still shows the other Company-OS pages to anyone of the platform organization; tenants can no longer reach them either way (ADR-017).
  - The engage browser tests are still not in CI.
- **Next:** WP-22 (settings: channel accounts, readiness checks, quiet hours, caps, send enabled).

## 2026-11-10 · WP-37 (one Lucy page for Company-OS and engage)
- **Done:**
  - **The platform organization may use engage:** migration `126_engage_org_product_all.sql` widens the product check to `workspace`, `engage` and `all`. `requireEngageUser` accepts `engage` and `all` and refuses everything else. `GET /api/engage/me` also reports the product. `npm run engage:platform` (`-- --off` to undo) sets `all` for the organization named by `PLATFORM_ORG_SLUG` and creates its engage settings row with sending off; it refuses a tenant and an organization that does not exist. Applying the migration changes no organization, so production is unchanged until the command is run.
  - **One `/marketing` page, chosen by organization** (`MarketingEntry`): the engage surface shows the engage page; the workspace surface shows the Lucy page as before and never asks the engage API; on the `all` surface the client asks `/api/engage/me` first. A tenant gets the engage page alone (never the Lucy chat or tools); the platform organization gets the Lucy page with engage on it; an organization the engage API refuses gets the Lucy page as before. Nothing is shown until the answer arrives, so a tenant never sees the Lucy page flash by.
  - **On the Lucy page:** tabs Lucy, Customers, Journeys, Segments, Templates; the engage "Go to" tiles under Lucy's own; New journey, segment and email template next to Lucy's quick actions; records and editors in panels over the page. The chat is hidden, not unmounted, while an engage tab is open, so it keeps its conversation.
  - **Shared parts** (`client/src/engage/engageWorkspace.tsx`): the engage hub for tenants and the Lucy page are thin hosts over the same tabs, tiles, quick actions and panels.
  - **Docs:** ADR-016, decision D-15, an ADR-002 note, the ADR-015 status, the `CLAUDE.md` rule (the Lucy page is the one frozen module that hosts engage), runbook `docs/runbooks/one-lucy-page.md` (local setup and production), backlog row WP-37.
- **Verified:**
  - **Server:** `tsc` clean; full suite 169 files, 1744 tests passed, 9 skipped (they need live services). Five new real-Postgres tests (the product values, the switch on and off, a tenant and a missing organization refused, the platform user passing the engage auth only while the switch is on, and the platform organization's engage data invisible to tenants and the other way round) and one unit test. Mutation check: 11 mutants (the product rule, the settings row, the tenant refusal, the changed flag, the off value, the platform slug), all caught.
  - **Client:** `tsc` clean; full Vitest 110 files, 629 tests passed. The real Lucy page is tested on each surface: workspace (exactly the Lucy page, the engage API never asked), `all` with the engage API refusing (unchanged), `all` with engage allowed (tabs, tiles, quick actions, panels, the chat kept mounted, a tile or tab closing the open panel, a member without the create actions). `MarketingEntry` is tested for each organization, including the wait for the answer. Mutation check: 22 mutants over the access rule, the tabs, the chat and the page choice; one survivor was a real gap (a tile did not close the open panel) and now has a test, one was a no-op mutation.
  - **Playwright (engage stack, 4 tests):** passed again on the refactored hub.
  - **Browser (a private copy of the dev database, `PRODUCT_SURFACE=all`):** migrations 120 to 126 applied cleanly; a Messign admin sees Lucy and the four engage tabs on one page, opens Customers (empty, from a real 200), creates an email template from the quick action (the row is in the `messign` tenant), and the Company-OS tiles and chat are all still there. A tenant signed in on the same deployment gets the engage page only: no Lucy chat, no Lucy greeting, no Company-OS tiles, and no Lucy API calls. Your dev database was not touched.
- **Found and fixed:**
  - A tenant on a shared deployment would have received the Company-OS Lucy chat and tools on the merged page. `/api/engage/me` now reports the product and `MarketingEntry` sends tenants to the engage page.
  - A tile or a tab did not close an open panel (caught by the mutation check).
- **Honest caveats:**
  - The `all` surface still shows the other Company-OS pages to anyone who signs in there; a tenant should sign in on an `engage` deployment (ADR-016).
  - `all` is meant for the platform organization only; the command is the only guard, the database cannot tell which organization is the platform one.
  - Engage still has no one-off "send now" action: email goes out as a step of an activated journey.
  - The password stored in `client/.env.local` for the dev auto sign-in does not match your dev database, so that sign-in fails (local only; not in this PR).
  - The engage browser tests are still not in CI.
- **Next:** run the runbook on your port 3000 (two lines in two env files, then `npm run db:migrate` and `npm run engage:platform`), then WP-22 (settings: channel accounts, readiness, quiet hours, caps, send enabled).

## 2026-11-10 · Engage inside the Lucy page (restructure of the WP-19 to WP-21 screens)
- **Done:**
  - **One page for engage:** on the engage surface `/marketing` is the Lucy page, rendered as the engage hub (`client/src/engage/EngageHub.tsx`). Customers, Journeys, Segments and Templates are tabs in the main column; the right column has the "Go to" tiles and quick actions (new journey, segment, template; tenant admins only). Lucy's chat is not offered on engage (ADR-009).
  - **Panels, not pages:** a customer, a journey (versions, results, scheduled runs), a new journey or version, a segment and a template open in a panel over the page. Nothing opens on its own route.
  - **Removed:** the separate engage sidebar entries and routes, `EngageHomePage` and `CustomersView`. On engage, `/customers`, `/journeys`, `/segments` and `/templates` redirect to `/marketing`. The engage sidebar is Marketing and Settings only.
  - **Header:** the search placeholder reads "Search..." on engage, not "Ask Lucy" or "Ask Dora". Unused `Page` and `LinkButton` helpers (only the separate pages used them) are gone.
  - **Docs:** ADR-015 records the decision. ADR-013, the WP-20 backlog row and the WP-19 to WP-21 entries now describe panels and sections, not screens and routes.
- **Verified:**
  - **Client:** `tsc` clean. Full Vitest run: 108 files, 616 tests passed. `EngageHub.test.tsx` (12 tests) drives the tabs, the admin-only quick actions, the journey, segment and template flows, and list freshness through the hub. `Customers.test.tsx` (8) drives the list and the customer panel. The surface and layout tests cover the new engage nav and the hub on `/marketing`.
  - **Playwright (engage stack, 4 tests, passed):** sign in and trace a sent and a blocked message; an old customer link lands on the Lucy page; create a template, a segment and a journey in the UI, then approve and activate; a refused save shows the server's reason on the same page. Run on spare ports 3202 and 3203 with a throwaway database, beside the running preview.
  - **Browser (engage preview):** `/marketing` shows the hub; `/customers` redirects to `/marketing`; the only API call on load is `/api/engage/profiles`, so no frozen Company-OS endpoint is called. The New journey panel opens and closes with Escape. Checked at phone width and desktop width; the sidebar lists Marketing and Settings only.
- **Found and fixed:**
  - The engage Playwright specs and the component tests drove the removed routes; they now drive the hub.
- **Honest caveats:**
  - A panel is not a deep link: a customer or a journey cannot be shared by URL yet (ADR-015 names `?panel=` as the follow-up).
  - The sidebar label stays "Marketing" on engage, although the page now holds the engage work.
  - The engage browser tests are still not in CI.
- **Next:** WP-22 (settings: channel accounts, readiness checks, quiet hours, caps, send enabled).

## 2026-11-10 · WP-21 (journey results: treatment versus holdout with a confidence interval)
- **Done:**
  - **Results** (`engage/analytics/journeyAnalytics.ts`, `GET /api/engage/journeys/:id/analytics?windowHours=`): enrolments by group and status, message counts (created, by status, held out), conversion (at least one order in the window after entry) and revenue per customer for treatment and holdout.
  - **Maturity:** only customers whose window has ended are counted in the rates.
  - **Statistics** (`engage/analytics/stats.ts`, pure): the difference treatment minus holdout, a 95% interval, "significant" when the interval excludes zero, and the relative uplift.
  - **Journey panel:** a Results section over the Lucy page with a 24 h / 72 h / 7 day window, the result in words, and a table for both groups.
  - ADR-014.
- **Verified:**
  - **Reconciliation:** an independent computation in the test (enrolments and orders read one by one, with the window and the evaluation moment) gives the same counts, conversions and revenue, for three windows, with orders exactly at the window edges and at entry, and orders after the evaluation moment.
  - **Statuses:** the completed counts are checked against the ledger.
  - **Statistics:** hand-computed values; the zero-interval case; empty groups.
  - **HTTP:** the window bounds, 401, and a tenant cannot read another's journey (404).
  - **Client:** 616 tests passed (4 results-panel tests); `tsc` clean.
  - **Server full suite:** 1741 passed, 6 skipped, twice in a row on fresh databases. The skipped tests need live services.
  - **Mutation check:** 13 mutants. 12 were caught. The one left (removing the order-side evaluation-moment bound) is equivalent: maturity already requires the window to have ended before the evaluation moment, so the bound never changes a result. It stays as a second line of defence.
- **Found and fixed:**
  - The reconciliation test did not cover window-edge orders, a completed enrolment, or the revenue difference sign; the mutants showed it, and the test now covers all three.
  - The results panel crashed on an unexpected answer; it now shows that results are not available.
- **Honest caveats:**
  - The interval is a normal approximation, rough for small groups. The pilot's groups are in the hundreds and up.
  - Results are computed per request. That is fine for one journey; a summary table is the next step at tens of millions of events.
  - Conversion counts any order in the window, not only one caused by the journey; the holdout is what separates the two.
  - The page does not show a per-step funnel chart (the counts exist in the ledger).
- **Next:** WP-22 (settings: channel accounts, readiness checks, quiet hours, caps, send enabled). This is also the screen that makes sending possible without commands.

## 2026-11-10 · WP-20 (journey builder UI: journeys, segments, templates)
- **Done (client only, over the existing APIs):**
  - **Lucy page (engage hub):** Journeys, Segments and Templates are sections of the engage hub on `/marketing`, next to Customers. (The first version shipped them as sidebar pages; the restructure entry above moved them onto the Lucy page.)
  - **Journeys:**
    - A list shows whether each journey runs and on which version.
    - A journey panel shows each version in words (trigger, stop-early events, holdout, re-entry, steps), with Approve / Activate for drafts and approved versions, and Stop with a confirmation. Admins only; members see why the buttons are missing. Segment journeys also show their scheduled runs.
    - The form editor covers the trigger (event with an optional filter, API, or a scheduled segment with a pinned version), stop-early events, re-entry, holdout and steps (wait, wait for an event with timeout and filter, branch rules, send email from a template list with an optional pinned version, end), with "then go to" targets and reordering.
    - A JSON tab handles anything the form cannot show. Combined conditions open there and are saved unchanged, never dropped.
    - "Check" asks the server without saving. A refused save shows the server's field issues next to the form and keeps what was typed.
  - **Segments:** conditions (all/any of field, operator, value) over order history, consent and attributes, with suggested fields and a JSON tab. "Count" shows how many customers match now, with a few examples, before saving. Versions and per-version counts are shown too.
  - **Templates:** create with a starter that already has the unsubscribe link, versions, and a rendered preview with a sample first name. The preview is in a sandboxed frame: no scripts, no access to the app.
  - **Pure form model** (`client/src/engage/journeyForm.ts`): form ↔ definition, round-trip tested.
  - **Smaller changes:** `fetchAPI` errors now carry the response body, so forms can show field issues. The engage hub links to its sections.
- **Verified:**
  - **Acceptance, in a browser (Playwright, engage stack):** a tenant admin creates a template (and previews it), creates and counts a segment, builds an event-triggered journey in the form (wait 30 minutes, then the email), checks it, saves it as a draft, approves and activates it, and the list shows it active. A second test shows a refused save with the server's reason. All four engage browser tests pass.
  - **Client:** 612 tests passed (11 builder component tests, 8 form-model tests, surface rules); `tsc` clean. Server full suite 1729 passed, 9 skipped (no server change).
  - **Clicked through in the browser:** editor, journey page, segment count, template preview. No console errors.
- **Found and fixed:**
  - **Journey list:** it stayed stale after creating, approving or activating, so a new journey did not show as running until a reload. Every change now refreshes the list. A test with a never-stale cache fails without the fix.
  - **Unreadable fields:** inputs and selects on the engage screens (WP-19's customer search too) used colours that are not theme tokens, so typed text was white on white. They now use the app's own `input-theme` / `select-theme`.
- **Honest caveats:**
  - Conditions in the form are single comparisons; combined trees are edited as JSON.
  - No drag-and-drop canvas (out of scope by design).
  - Templates are pasted HTML (no visual editor yet).
  - The engage browser tests are not in CI.
- **Next:** WP-21 (analytics: funnel, delivery, conversions vs holdout).

## 2026-11-10 · WP-36 (rule-based segments and the scheduled segment trigger)
- **Done:**
  - **Migration `124_engage_segments.sql`:** segments with immutable versions, and a run table with one row per (journey, slot). The migration also adds the segment enrollment kind and a fourth id-only definer list for the scheduler.
  - **Segment definition** (`engage/segments/`): one condition tree over `attributes.*`, order history (`orders.count`, 30/90/365-day counts, spend, days since the last and first order) and `consent.email`. Customers are never in a segment once erased.
  - **Compiler:** a pure compiler turns a definition into SQL. Every value and attribute name is a bound parameter.
  - **Journey trigger `segment`:** `{segment, segment_version, every_days, at_local_time}`. The journey pins a segment version, so changing the audience means a new, approved journey version.
  - **Schedule:** runs every N days at the tenant's local time, counted from activation. The first run is never at once, and only the latest due slot runs.
  - **Claim and resume:** a run is claimed once per slot and resumes from its cursor after a crash, with exact counts.
  - **Enrollment key:** `segment:<slot>:<customer>`, so each customer is enrolled once per run.
  - **Cap:** at most 100,000 customers per run.
  - **API:** `/api/engage/segments` (list, read, create, versions, preview, count) and `GET /api/engage/journeys/:id/segment-runs`.
  - **Refactor:** enrolling moved to `journeys/enroll.ts` and is shared by events, the API and runs.
  - ADR-013.
- **Verified:**
  - **Parity:** the SQL gives the same answers as the journey condition evaluator on 259 conditions over 32 customers with awkward values (wrong types, nulls, arrays, empty strings, `%`, quotes), with guards against a vacuous comparison.
  - **Acceptance, counts:** counts match independently written SQL for 22 definitions: order counts and windows, spend, recency, consent, attributes, erased customers, orders after the evaluation time.
  - **Acceptance, runs:**
    - A run enrolls exactly the members once.
    - The same run again, and 6 concurrent runs, change nothing.
    - An interrupted run resumes with exact counts.
    - The second slot enrolls again only under re-entry `after_exit`, and never while a customer is still in the journey.
    - The cap reports `truncated` only when more matched.
    - The schedule is exact, including a New York daylight-saving day.
    - A segment journey sends to the members only.
  - **Suite:** server full suite 1729 passed, 9 skipped, two runs in a row on fresh databases; `tsc` clean. Client unchanged.
  - **Mutation check:** 31 mutants. 24 were caught at once; 7 survived, 5 of them led to sharper tests (fractional days, window edges, spend, schedule edges, a journey stopped mid-run) and are caught. 2 remain, neither a behaviour difference: a chunk-level row lock that only matters once a claim outlives its ten-minute lease, and a cap check the next loop turn repeats.
- **Honest caveats:**
  - No UI (WP-20): segments and journeys are created through the API.
  - Evaluation scans the tenant's order events once per run and per count (fine for tens of thousands of customers; a per-customer order summary is the next step).
  - `product_ids` are stored but not queryable yet (no "bought a book by this author" segments).
  - Nothing was run on production data, and no mail was sent: the gate, consent and sandbox allow-list apply as for any journey.
  - **Found by the repeated suite runs (migration `125_engage_fk_indexes.sql`):** deleting the 100,000-customer test tenant took minutes once other tenants had enrollments, because the foreign keys to customers, messages and journey versions had no full index (only partial ones, which a foreign-key check cannot use), so each deleted row scanned the child table. The migration adds the indexes (`enrollments` by customer and by version, `enrollment_steps` by message, `segment_runs` by versions). The customer trail (WP-19) and the segment runs look enrollments up by customer, so they gain too. A schema guard test now fails if a foreign key to those parents lacks one. The 100k teardown also has a 240 s allowance.
- **For you:** after merging, run `npm run db:migrate` on production (migrations 124 and 125; the indexes build in moments on today's data).
- **Next:** WP-20 (journey builder UI, form-based; segments get a screen with it), then WP-21 (analytics vs holdout).

## 2026-11-09 · WP-19 (engage customers: list and audit trail)
- **Done:**
  - **Server** (`engage/profileTrail.ts`, read only, tenant context):
    - `GET /api/engage/profiles`: newest first; keyset cursor; `q` is an email (any address the customer ever had) or the start of a customer ID, with `%` and `_` taken literally.
    - `GET /api/engage/profiles/:id/trail`: messages with delivery events and every send-gate decision, each decision with the consent record in force when it was taken (the newest ledger row for that channel at or before the decision); journeys step by step, with cohort and how they ended; consent history; suppressions of every address the customer ever had; addresses with history; recent events.
  - **Client** (`client/src/engage/`): a **Customers** section of the engage hub on the Lucy page; a list (search, consent/suppressed/erased badges, load more) and a detail panel (messages with decisions in words and the consent in force, journeys, consent history, suppressions, addresses, events). On the Company-OS workspace the hub is not shown, because the engage API is not mounted there.
- **Verified:**
  - Server full suite: 1695 passed, 9 skipped, three runs in a row on fresh databases (121–135 s, down from 150–250 s).
  - Client: 591 tests passed; `tsc` clean on both.
  - New tests: 6 server end-to-end on real Postgres and HTTP. **Acceptance:** a sent message shows its allow decision with the grant in force; after a revocation, the next message shows its deny with the revocation in force; a decision taken before any consent shows none. Also tenant isolation, paging, search and wildcards, journey links, an old address's suppression. 7 client component tests and the surface rules.
  - Mutation check: 4 client mutants and 9 server mutants. All but one were caught at once. The survivor (consent taken from another customer would have gone unnoticed) led to a sharper test.
- **Also fixed (test reliability):**
  - The WP-18 simulator unit test had a quadratic duplicate check; it is now a lookup.
  - Test teardown now locks `engage.events` before deleting organizations, so it locks in the same order as partition creation and cannot deadlock with it. The WP-17 partition-lock approach made teardowns wait for each other and time out under load.
  - The WP-17 ingestion-deadlock test dropped a partition that another test file could be filling. It is replaced by a statement-order check (every partition is ensured before the first event is written), which fails without the fix and needs no missing partition.
  - The CSV order-import tests get 60 s.
  - **Root cause of the random timeouts:** creating an event partition needs an exclusive lock on `engage.events`. It waits for other files' long transactions, and every other query on events queues behind it.
  - The test fixture now creates every monthly partition of the window once, before any test runs. So the ingestion tests named "on demand" and "creation race" now find their partition already there. Partition creation itself still runs: in the fixture, and on any month that is missing.
  - **Follow-up (production):** the same queue can briefly stall event ingestion on the first event of a new month while a long transaction runs. A small scheduled job that creates next month's partition ahead of time would remove that.
- **Follow-ups done in the same PR (Hamza: "first do what was not done"):**
  - **Browser E2E (Playwright)** `e2e-engage/customer-trace.spec.ts` with `playwright.engage.config.ts`. It runs its own stack beside the usual dev servers (client 3200, API 3201, engage surface, sandbox, mock email) on a throwaway database. The database is seeded by `server/src/scripts/engageE2eSeed.ts`: a tenant with a generated password and the cart journey run over 30 simulated carts. The test signs in, opens Customers, then traces a sent message (allow, consent granted) and a blocked one (deny, no consent in force); a made-up customer id shows "does not exist". Run: `ENGAGE_E2E_ADMIN_URL=<local throwaway db> npx playwright test -c playwright.engage.config.ts`. Two passed. Not in CI yet (CI has no browser job).
  - **Clicked through in the browser** on the same stack, at mobile and desktop widths: list, search, detail pages for a blocked and a sent customer, journeys, consent history, addresses and events. No console errors; one API call per screen, no request loop. Found and fixed: the header breadcrumb showed the customer's UUID as words ("3d0aae44 B1cb …") and the root label in lowercase; it now reads "Customers › Details".
  - **Event partitions ahead of time:** an hourly pg-boss job (`engage/partition-maintenance`, also run once at boot) creates the next two days' partitions, so the first event of a month no longer has to create its partition (and take the exclusive lock) on the request path.
  - **Dev proxy target:** `client/vite.config.js` is the config Vite actually loads (it is tracked next to `vite.config.ts`, and Vite prefers `.js`), so the proxy change went into both. Worth tidying later: one config file instead of two.
- **Honest caveats:**
  - The engage browser test is not part of CI.
  - The UI stays English (decided: English only).
  - The trail shows at most the newest 100 messages and events, 50 journeys and 200 consent records.
- **Next:** WP-36 (rule-based segments and a scheduled segment trigger), then WP-20 (journey builder UI).

## 2026-11-09 · WP-18 (cart abandonment: journey template, event simulator, 10k load)
- **Done:**
  - **Ready-made journey** (`engage/journeys/cartAbandonment.ts`): cart_updated → 1 h → reminder 1 → 24 h → reminder 2 → end. An order (by when it happened) ends it; re-entry after exit; 10% holdout. It comes with two Turkish email templates that include the unsubscribe link. `installCartAbandonment` creates the templates and a **draft** journey; a tenant admin approves and activates it.
  - **Seeded event simulator** (`engage/simulator/cartSimulator.ts`, pure). It covers carts that are abandoned, bought before the reminder, bought between the reminders, or reported late; repeated cart updates; 10% duplicate deliveries; and 5% of customers without consent. It derives each customer's expected outcome from the scenario alone.
  - **Harness:** `runCartSimulation` drives the real path on a simulation clock: ingestion, executor (new tenant-only `runTenantTick`), dispatcher, gate and mock adapter. `verifyCartSimulation` compares the database with the expectation.
  - **Operator script:** `npm run engage:simulate-carts` (`--install`; `--dispatch` only with mock accounts, sandbox forced).
  - **Migration `123`:** the work lists take an optional tenant filter.
- **Verified:**
  - **10,000-cart acceptance run** (`ENGAGE_SIM_CARTS=10000`, 236 s): all 10,000 customers matched the expected outcome. Detail:
    - every customer enrolled once; 6,072 exited on an order, 3,928 completed;
    - 10,358 messages created, 9,865 sent and 493 blocked (no consent);
    - holdout 9.5%;
    - every send reached the adapter exactly once, and no message has two `sent` events.
  - The regular suite runs the same test at 1,000 carts (about 30–60 s). Server full suite: 1689 passed, 9 skipped, two runs in a row on fresh databases; `tsc` clean.
  - **Mutation check:** 13 mutants, all caught on the first run. They covered the tenant tick's clock, the template (exit, delay, holdout, auto-activation), the simulator's timings and duplicates, the verifier, the harness's consent and ingestion dedup.
- **Found and fixed:** the cross-tenant tick in one test file, run on that test's own clock, acted on the simulation tenant's enrollments (reminder 2 never came). This can't happen in production (one clock), but the work lists now take a tenant filter and every test that drives the tick names its tenants.
- **Honest caveats:**
  - An order that is recorded only after reminder 1 went out cannot undo that reminder. The simulator expects exactly that.
  - No UI yet (WP-19/20): installing, approving and watching happen through the API, the script and the database.
  - The 10,000-cart run is not part of every CI run (it takes about 4 minutes); it is one command.
  - Nothing was sent through SES.
- **For you:** after merging, run `npm run db:migrate` on production (migration 123).
- **Next:** WP-19 (engage UI shell and profile list/detail with an audit trail).

## 2026-11-09 · Decisions D-13 and D-14, production state after WP-15..17
- **Decided:** D-13: the approver of a journey version may be its author (Hamza). D-14: an unsubscribe keeps suppressing the address for every purpose, transactional mail included (decided by Claude on Hamza's delegation; no code change). Reasons: the compliance table says transactional never bypasses suppression for hard opt-outs, R-3 is instant and global per channel, the stricter rule is the one that cannot create a legal problem, and the pilot sends only marketing journeys. Cost: nothing in the app can lift a suppression (append-only ledger), so a customer who unsubscribes from marketing gets no order mail from Messign; revisit before a tenant sends transactional mail through Messign **[LC]**. Corrected ADR-004, which wrongly said the tenant could remove a suppression.
- **Production (Hamza ran the migrations):** migrations 120, 121 and 122 applied. demo-kitap had five active SES email accounts, which would make every journey message step fail (`email_account_ambiguous`); four old ones were disabled, the one that delivered the test mail (`63deec80`) stays. No queued messages. `SEND_MODE` set to sandbox on Railway.
- **Cleanup:** temporary migration worktree removed. The exposed AWS root key and the shared passwords were left to Hamza (not done by Claude).

## 2026-11-09 · WP-17 (branch, re-entry, holdout, message step, dispatcher)
- **Done:**
  - Migration `122_engage_journey_messages.sql`:
    - **Cohort:** each enrollment gets a cohort, treatment or holdout. It is drawn once and is part of the enrollment's identity.
    - **Message link:** a step row records the message it created; one message belongs to at most one step.
    - **Dispatcher work list:** a third id-only work list, `due_message_work`.
  - **Branch:** branches are tried in order on profile attributes and the payload; the first match wins, otherwise the fallback.
  - **Message step:** creates the templated message in the same transaction as the step, with key `journey:<enrollment>:<step>`. It uses the tenant's one active email account and fails closed with none or several.
  - **Re-entry:** `never` by default, or `after_exit`.
  - **Holdout:** `holdout_percent` (0–50, default 10, D-11). A holdout enrollment runs every step and records its message steps as `held_out`; no message is created.
  - **Dispatcher:** the journey tick now also sends due messages of every tenant, each through the send gate. With `SEND_MODE` off it does nothing.
  - **Refactor:** `createMessageOn` and `createTemplatedMessageOn` run inside the caller's transaction.
  - **Docs:** ADR-012 §8; notes in ADR-004 and ADR-011.
- **Verified:**
  - Server full suite: 1681 passed, 9 skipped, three runs in a row on fresh databases; `tsc` clean. 15 new end-to-end tests on real Postgres and the mock channel.
  - **Acceptance:**
    - Event → delay → message → dispatcher → gate → mock adapter sends once.
    - A run that crashes after creating the message leaves no message; the retry creates exactly one.
    - Concurrent and repeated runs create one message per enrollment.
    - An order after the cart, also out of order, leaves no message.
    - Re-entry `never` and `after_exit` hold.
    - Holdout is 10% ±2% over 10,000 real enrollments; at 0% nobody is held out.
    - Nobody, not even the database owner, can change a cohort.
  - **Mutation check:** broke the code 21 ways; all 21 were caught on the first run.
- **Also fixed (found by the heavier test load):**
  - **Ingestion deadlock (real):** a batch spanning two months wrote its first event, then waited to create the second month's partition, while another partition creation waited for it. Partitions are now created before anything is written. A test reproduces the deadlock without the fix.
  - **Test teardown (test-only):** deleting organizations could deadlock with a partition creation in a parallel test file; the delete now takes the partition lock first.
- **Honest caveats:**
  - **Dispatcher goes live on deploy:** any queued message in production will be dispatched once the deploy is up, if `SEND_MODE` on Railway is not off. Old test messages have expired and will be blocked, with no send.
  - **Account choice:** the email account is chosen only when the tenant has exactly one active email account. Disable the old SES accounts first, or journeys fail with `email_account_ambiguous`.
  - **Not done:** frequency cap overrides per journey, SMS/WhatsApp steps and webhook steps.
  - **Not verified:** a real send through SES from a journey.
- **For you:** after merging, run `npm run db:migrate` on production (migration 122).
- **Next:** WP-18 (cart-abandonment template, event simulator, 10k load).

## 2026-11-09 · WP-16 (journey executor: triggers, delay, wait-until, exits)
- **Done:** migration `121_engage_enrollments.sql`: enrollments (unique per journey and trigger key; one active per profile and journey) and a step ledger (one row per step); the database refuses changes to an ended enrollment, a finished step, an enrollment's identity or a step's deadline, and the engage role cannot delete. Two SECURITY DEFINER work lists (`pending_trigger_work`, `due_enrollment_work`) give the scheduler tenant and row ids only. Executor `engage/journeys/engine.ts`: events start the journeys whose filter they match and wake the profile's running enrollments; `POST /v1/journeys/:key/trigger` now enrolls (202), answers a repeat with the same enrollment (`duplicate`) and refuses a reused key with another request (409); delay, wait-until with timeout (continue or exit), exit conditions checked by event time before every run. A pg-boss tick runs every minute and right after accepted events or triggers. Pure condition evaluator (`conditions.ts`). New ADR-012; notes in ADR-007 and ADR-011.
- **Verified:** server full suite 1665 passed, 9 skipped; `tsc` clean. 31 engine tests on real Postgres and HTTP, 33 condition tests. Acceptance: concurrent, repeated and crashed runs (a simulated failure between two writes) leave one ledger row per step and act once; replayed and concurrent triggers enroll once; an order after the cart ends the enrollment and wakes it at once, also when the order is processed before the cart event. The isolation suite now lists every SECURITY DEFINER function the engage role can call. Broke the code 43 ways: 34 caught at once; 8 survivors led to sharper tests (concurrent runs now repeat five rounds because overlap depends on timing, a deterministic race for the trigger API, the database uniques tested directly, the tick with a batch of one); 1 was an equivalent mutant and that check was removed. All are now caught.
- **Honest caveats:** branch and message steps are not executed yet: an enrollment that reaches one ends `failed / step_not_supported_yet` and sends nothing (WP-17). Re-entry rules and holdout are WP-17, date-attribute triggers WP-25. Events older than 24 hours start nothing. An event recorded late, after a step already acted, cannot undo that step. Stacked on PR #26 (WP-15).
- **For you:** after merging #26 and this PR, run `npm run db:migrate` on production (migrations 120 and 121).
- **Next:** WP-17 (branch, re-entry, holdout, message-step integration).

## 2026-11-09 · WP-15 (journey definitions, versions, approval and activation)
- **Done:** migration `120_engage_journeys.sql` (journeys + immutable versions; the database refuses activation without approval, changing a definition, undoing a lifecycle step, retiring a version that never ran, and a second active version); strict v1 definition schema (event/api/date-attribute triggers; delay, wait-until, branch, email message, exit steps; acyclic graph, all targets exist, all steps reachable; template references checked against the tenant); service and API `/api/engage/journeys` (list, get, validate for tenant users; create, new version, approve, activate, stop for tenant admins), each step recorded with who and when. Approval stays inside engage instead of the Company-OS approval queue (no tenant isolation there). New ADR-011; open decision D-13 (two-person rule).
- **Verified:** server full suite 1602 passed, 9 skipped; `tsc` clean. 28 definition tests (cart abandonment, loops, dangling and unreachable steps, strict keys, condition depth); 15 end-to-end tests on real Postgres and HTTP. Acceptance shown three ways: the API refuses, the engage role's direct UPDATE is refused by the CHECK, and so is the database owner's. Broke the code 20 ways: 18 caught at once; the 2 survivors led to sharper tests, and one of those found a real bug: two activations at the same moment failed because the retired-at time came from the start of the waiting transaction (`now()`), earlier than the activation it retired. Lifecycle times now use `clock_timestamp()`; all 20 mutants are caught.
- **Honest caveats:** nothing runs yet (executor is WP-16; the trigger API still answers 501). The author may approve their own version (D-13). No webhook steps in v1. No UI (WP-20).
- **For you:** run `npm run db:migrate` on production after merging (migration 120). Decide D-13 when convenient.
- **Next:** WP-16 (executor: event/API triggers with idempotency key, delay, wait-until with timeout, exit conditions).

## 2026-11-09 · WP-14 (templates: safe variables, preview, no blank sends)
- **Done:** migration `119_engage_templates.sql` (templates + immutable versions, forced RLS, no UPDATE/DELETE for the engage role); a pure renderer for Unlayer HTML with a tiny variable language (`{{name}}`, `{{payload.name}}`, `{{unsubscribe_url}}`, `| default: "..."`) and context-aware escaping (text, attribute, URL start must be https, URL rest percent-encoded) with unsafe placements and dangerous HTML rejected at save time; `createTemplatedMessage` (records template and version; marketing gets the recipient's WP-13 links; idempotency on the request, not the rendered text); gate rule `render_<code>` so a failed render is denied with a decision row; API `/api/engage/templates` (list, get, create and version for admins, preview for any tenant user, placeholder unsubscribe link). Notes in ADR-004 (WP-14).
- **Verified:** server full suite 1544 passed, 9 skipped; `tsc` clean (client unchanged). 49 renderer tests, including a real-shaped Unlayer export rendered and compared byte for byte outside the variables; 16 end-to-end tests on real Postgres and HTTP (acceptance: a missing variable is created as a message, denied `render_missing_variable`, never reaches the adapter; roles; tenant isolation; immutability; concurrent version numbers; preview stores nothing; retry after profile/template change is the same message). An import-graph test proves nothing reachable from `engage/templates/` leads to the AI services. Broke the code 20 ways: the first run of the tests caught 18; the 2 survivors (inherited properties like `{{constructor}}`, and a variable in the middle of an unquoted attribute) each led to a sharper test; all 20 are now caught. Writing the tests also found a real hole before any commit: `<{{x}}>` would have let a value become a tag.
- **Honest caveats:** templates are created through the API only (no editor UI until WP-20) and nothing calls `createTemplatedMessage` yet (journeys, WP-16). No localisation or date/number formatting; values render as given. Stacked on PR #24 (WP-13).
- **Next:** WP-15 (journey definitions, versions, approval and activation).

## 2026-11-09 · WP-13 (unsubscribe: signed link, one-click, page)
- **Done:** HMAC-signed unsubscribe token (tenant, profile, channel; key id inside, so master-key rotation keeps old links working; no personal data, no expiry); public `GET`/`POST /api/engage/unsubscribe/:token` (GET never changes state; POST is the RFC 8058 one-click target and the page's button) writing consent ledger, state and address suppression in one transaction; per-profile advisory lock so repeats and simultaneous requests leave one ledger row; SES `List-Unsubscribe` + `List-Unsubscribe-Post` headers; gate rule `content_no_one_click_unsubscribe` for marketing email; public page `/u/:token` (Turkish/English, noindex, no-referrer); `buildUnsubscribeLinks` fails closed without `https` public origins. No migration. Notes in ADR-004 (WP-13), runbook step 2.7.
- **Verified:** server full suite 1479 passed, 9 skipped; client 572 passed; `tsc` clean on both. 26 token/link unit tests, 12 end-to-end tests on real Postgres and HTTP (acceptance: a click, then the next marketing **and** transactional message to that address are denied `suppressed`; forged, tampered, junk and crossed-tenant tokens are one 404 and change nothing; GET changes nothing; rotation; rate limit; nothing logged), 12 page tests. Broke the code 16 ways: 13 caught at once, 3 survived and each led to a stronger test (a hand-built signed token for another channel, an address already suppressed by a bounce, and a warmed-up pool so concurrent requests really overlap); all 16 are now caught.
- **Also fixed:** the quiet-hours gate test failed before 09:00 UTC (message expired after 24 h, same line as PR #22), and a pg import in the new file broke the engage import lint.
- **Honest caveats:** an opt-out suppresses the address for **every** purpose (WP-11 design, R-3), so someone who unsubscribes from marketing also stops receiving order mail at that address until the tenant removes the suppression; decide whether that is what Kitapyurdu wants. Nothing was sent to a real mailbox provider with these headers: Gmail/Yahoo's bulk-sender handling is unverified until a real marketing test to a Gmail inbox. The page cannot re-subscribe (a grant needs the tenant's own consent evidence). Nothing calls `buildUnsubscribeLinks` in production yet: the renderer (WP-14) will.
- **For you:** set `ENGAGE_PUBLIC_APP_URL` and `ENGAGE_PUBLIC_API_URL` on Railway before the first marketing send. Open PRs #20, #22 and #23 are still waiting for a merge.
- **Next:** WP-14 (template rendering from Unlayer HTML with safe variables and preview).

## 2026-11-09 · Engage shell: /marketing without Company-OS errors
- **Found:** after the first tenant sign-in, `/marketing` on the engage surface showed "Reimbursement access not set up for this user" (red banner, Funnel/Brands, approval-queue toast), Lucy failed with 404 on `/api/knowledge-hub/ai/answer`, and the shell called ~12 frozen Company-OS endpoints (projects, tasks, chat, badges, activities, leaderboard, reimbursement/approval counts, notifications, marketplace, Dora insight counts) that answer 404/403 on engage.
- **Decision (with Hamza):** the legacy marketing API stays closed to engage tenants. It is pinned to the `messign` organization in `reimbursementAuth`, and making it tenant-aware would expose other organizations' data: its queries rely on RLS through a bypassing role, and several of its tables have no RLS (current-state §3; confirmed `marketing_brand_profiles`, `marketing_approval_queue`, `marketing_email_campaigns`, `notifications` locally). Lucy/Dora stays frozen for tenants (ADR-009).
- **Done (client only):** on the engage surface `/marketing` shows a plain engage home (`client/src/engage/EngageHomePage.tsx`, no API calls) instead of the legacy hub; the shell no longer loads Company-OS data, the reimbursement provider, the notification bell, the marketplace query or Dora insight counts (`mountsFrozenModules()` in `lib/productSurface.ts`, mirroring the server); the default view is no longer the frozen dashboard. API errors now carry their HTTP status and queries never retry a 4xx.
- **Verified:** client 574 tests passed, `tsc` clean; new tests for the surface helper, the marketing view per surface, and the retry policy. Browser (local engage): `/marketing` renders the engage home with zero `/api` requests and no new console errors. Workspace surface covered by tests only (not clicked through).

## 2026-11-08 · Engage tenant sign-in (found while running Engage locally)
- **Found:** no engage tenant user could sign in. `POST /api/auth/login` (and the login form) accepted only `@messign.com`, and the user lookup after the password check was hard-wired to the default `messign` organization, so a tenant admin got "User not found" even with the right password. Same in production.
- **Done:** addresses outside `@messign.com` are accepted only where engage is mounted (`PRODUCT_SURFACE` engage/all) and only for accounts of an organization with `product = 'engage'`; such users are looked up in their own organization at login and in `/api/auth/me`. Anything else is refused exactly like a wrong password, after the password check (no account probing). The login form drops the domain rule on the engage/all surface. Company-OS sign-in unchanged. Note in ADR-002.
- **Verified:** new integration test on the real auth + engage routers and Postgres (tenant admin signs in, token carries their own organization, `/api/auth/me` and `/api/engage/me` work and show only their tenant; wrong password, unknown address and a right-password Company-OS account outside `@messign.com` get identical refusals; workspace surface still 403; `all` surface works); client schema test. Broke the change 9 ways, all caught. Full suites: server 1439 passed, 6 skipped; client 563 passed; `tsc` clean on both. In the browser (local engage dev setup): tenant admin signs in, is sent to the forced password change, then lands on `/marketing`.
- **Not done / found:** the engage shell still wraps pages in the Company-OS reimbursement provider, so `/marketing` shows "Reimbursement access not set up for this user" for tenant users (separate fix). Non-production builds still accept the demo password `test123` for any account (pre-existing dev self-heal).

## 2026-11-08 · WP-12 follow-up (first real SES send: delivery report lost to a race)
- **Found:** the first real send reached the inbox, but the `delivered` report never changed the message. Railway's HTTP log showed the webhook POST at the same second as the send (200). SES reported delivery before Messign had stored the SES message id, so the report was "unmatched", dropped, and answered 200, which stops SNS retrying.
- **Fixed:** the webhook answers 503 when any report is unmatched, so SNS retries (matched events are already stored; repeats are skipped). Regression test reproduces the race (id not stored yet → 503 → stored → retry applies `delivered`); mutation check: removing the fix fails it and the cross-tenant test. Full suite 1432 passed, 9 skipped; `tsc` clean.
- **Proof still pending:** deploy this, then send a new test message (`engage:send-test`); the old test message stays `sent`.

## 2026-11-08 · WP-12 (email adapter and signed webhooks)
- **Done:** Amazon SES (API v2) adapter with hand-written SigV4 signing; SES → SNS → `POST /api/engage/webhooks/:accountId` with SNS signature verification, topic pinning, certificate-host pinning and automatic subscription confirmation; hard bounces and complaints suppress the address in the same transaction; migration `118_engage_email_webhooks.sql` (`complained` event type, one-row pre-auth account lookup); setup runbook `docs/runbooks/ses-sandbox-setup.md`. Notes in ADR-004 (WP-12).
- **Verified:** `tsc` clean; full suite 1431 passed, 9 skipped. SigV4 reproduces AWS's published `get-vanilla` test vector; the SNS string-to-sign matches the AWS documentation example byte for byte. 41 SES unit tests and 11 end-to-end tests on the real HTTP stack and Postgres: dispatch → (faked) SES → signed Delivery/Bounce/Complaint notifications → status, suppression, and the gate denying the next send; forged, tampered, re-signed-for-another-topic and foreign-certificate notifications → 401 with nothing changed; unknown or disabled account → 404; certificate unavailable → 503; reports never cross tenants. Broke the adapter, signer, route and migration 45 ways: 44 caught, 1 equivalent (the route's own "account active" check, which the credential store repeats). Mutation testing found 5 test gaps; all closed. The isolation suite caught the new pre-auth policy and the unauthenticated route on the first run; both are now explicit, narrow exceptions.
- **Honest caveats:** **nothing has touched real AWS.** Acceptance item "delivery to a verified test inbox" needs your SES sandbox account (runbook steps 1–2). SES has no idempotency key, so a crash after SES accepted a message can send it twice. `List-Unsubscribe` comes with WP-13.
- **For you:** run `npm run db:migrate` on production (116, 117, 118). Then, when you want a real send: create the SES sandbox side and store the account as in the runbook, and tell me; I will help verify the first delivery.
- **Next:** WP-13 (unsubscribe token, one-click `List-Unsubscribe`, preference page).

## 2026-11-08 · WP-11 (send gate)
- **Done:** migration `117_engage_send_gate.sql` (`send_decisions`, `send_allowlist`, `rate_cards`, `budget_caps`, message expiry and cost reservation, quiet-hours function, `claim_message` now requires an allow decision); `server/src/engage/messaging/gate.ts` replaces the interim gate; `gateConfig.ts` for the allow-list, rate cards, budget caps, quiet hours and frequency cap. Design in ADR-004 and ADR-008 (WP-11 notes).
- **Kill switches:** `SEND_MODE` off and tenant `send_enabled` false both hold messages without writing anything, and are read again per message, so flipping either stops a running batch at the next message (tested: 3 sent, 17 held). A held message expires after 24 h by default instead of going out late.
- **Verified:** `tsc` clean; full suite 1379 passed, 9 skipped. 31 new real-Postgres gate tests plus 22 content-rule unit tests, covering every roadmap acceptance item: no consent → deny; consent revoked after creation or between retries → deny; sandbox + non-allow-listed → deny (also: removed entry, other channel, other tenant); suppressed address under a new profile → deny for every purpose; `SEND_MODE=off` → 0 adapter calls and no rows; budget exceeded → deny, exact at the cap, and 15 concurrent sends against a cap of 5 send exactly 5. Quiet hours checked against a reference implementation on 300 random instants in four time zones (two with daylight saving). The database refuses a claim with a missing, denied, stale, foreign-message or foreign-tenant decision. Broke the gate, its migration and config 65 ways: all 65 caught, after adding tests for 9 gaps the first run exposed.
- **Honest caveats:** content checks catch obvious omissions (no unsubscribe link, no `iptal`/`stop`, bad sender ID length); they do not make a message lawful. The readiness item list per channel is our reading of ADR-004, not legal advice. One cost unit per message (no SMS segments, no actual provider cost). The per-tenant-and-channel lock serialises gate decisions; fine at pilot volume, measure at WP-32. `send_enabled` still has no setter (WP-22); set it in SQL for now. If both delivered and failed reports arrive, the first still wins (WP-10).
- **For you:** run `npm run db:migrate` against production to apply 116 and 117. Nothing calls dispatch yet, so this changes no behaviour.
- **Next:** WP-12 (email adapter on a Messign-owned sandbox ESP, signed webhooks, bounce/complaint suppression). Needs the sandbox ESP account (D-05).

## 2026-11-08 · WP-10 (messaging core)
- **Done:** migration `116_engage_messages.sql` (`engage.messages`, append-only `engage.message_events`, `engage.claim_message`); `server/src/engage/messaging/` with the provider-neutral adapter contract and registry, the mock adapter (scriptable failures, signed delivery reports), the ledger functions (`createMessage` with idempotency, `getMessage`, `ingestProviderEvents`, `ingestWebhook`), `dispatchMessage`/`dispatchDue` (claim, retry with backoff, lease recovery), and a deterministic delivery-report simulator (shuffle, duplicates, missing reports). Design in ADR-004 and ADR-008 (implementation notes).
- **Interim gate:** until WP-11, `dispatchMessage` holds everything while `SEND_MODE` is off, allows only the mock adapter on a test account in sandbox, refuses live outright, requires consent for marketing, and blocks suppressed addresses and missing recipients. A test enforces that only `dispatch.ts` calls an adapter's `send`. There is no `send_decisions` table yet; the reason is on the `blocked` event.
- **Verified:** `tsc` clean; full suite 1326 passed, 9 skipped. 94 new tests on real Postgres through the non-bypass role: status machine for every order of delivered/failed/bounced/sent reports, 300 messages with shuffled and duplicated reports reach the expected status and a second pass changes nothing, 10 concurrent dispatches send once, 20 concurrent creates make one row, forged or tampered webhooks rejected, crash recovery by lease, no addresses in events or logs. Broke the migration and code 66 ways: 62 caught; 4 accepted (an attempt-limit guard that the dispatcher's own checks make unreachable, the SEND_MODE-off check that exists twice on purpose, and the loop that keeps `dispatchDue` going after an unexpected error, which no test can trigger). Mutation testing found 13 gaps in my first test set; all closed.
- **Found on the way:** the event trigger refuses an insert without a tenant context even from a connection that bypasses RLS. The isolation seeder had to set one. Any future admin tool that writes events must do the same.
- **Honest caveats:** nothing sends for real: no real adapter exists and live mode is refused. Two different final reports for one message (delivered vs failed) are decided by arrival, first wins; that is a choice, not a fact about providers. A crash between "provider accepted" and "recorded" re-sends with the same idempotency key, which only a provider that deduplicates on it will absorb. `message_events` is not partitioned; revisit at the WP-32 volumes. No public webhook route yet (WP-12). Cost columns exist but are empty (WP-11).
- **For you:** run `npm run db:migrate` against production to apply 116. It only adds tables and functions; nothing calls them until a later work package wires dispatch to a job.
- **Next:** WP-11 (full send gate, `send_decisions`, rate cards and budget caps, recipient allow-list, kill switch). It must replace the interim gate, not wrap it.

## 2026-11-08 · WP-09 (CSV import and synthetic tenants)
- **Done:** migration `115_engage_imports.sql`; CSV importer for profiles (with consent evidence columns) and orders, run as a pg-boss job with a value-free report, dry run, and operator CLI (`npm run engage:import`); `POST/GET /api/engage/imports` for tenant admins; synthetic tenant generator (bookstore and florist, Turkish names, deliberate mess) with `npm run engage:synthetic`; format guide `docs/onboarding/csv-import-format.md`. Details in ADR-005 (implementation notes).
- **Verified:** `tsc` clean; full suite 1246 passed (two consecutive runs). 28 unit tests and 23 real-Postgres tests (normalization, evidence rules, merge of duplicates within and across chunks, conflicts reported, erased profiles refused, idempotent re-run adds no rows, orders create events but no outbox rows, dry run writes nothing, job deletes the uploaded file, admin-only HTTP, tenant separation, no PII in reports or logs). **100,000 synthetic profiles round-trip** (about 30-45 s locally): the database ends with exactly the profile and order counts the generator states, no value has two active owners, and a re-run adds nothing. The generator's guards only allow `example.*` emails and the `+90 5000` test range. Broke the importer, job, routes, generator and migration 23 ways: 22 caught outright, 1 equivalent (BOM strip, because header trimming already removes it); one gap found and closed (nothing checked that shared emails are generated).
- **Flake fixed:** `ALTER ROLE messign_engage` in the test fixture could collide with the migration-runner tests (the role is cluster-wide; the advisory lock is per database), failing a suite with "tuple concurrently updated" now and then. The fixture retries it. It was already possible; more engage suites made it likelier.
- **Honest caveats:** the `+90 5000` range is our own choice, not an official reservation. Import speed was measured on a local database, not Railway. Orders older than 399 days are reported, not stored, so lifetime spend is not available to segments yet. An import stopped by a database error keeps rows already written; re-run the same file to continue.
- **For you:** run `npm run db:migrate` against production to apply 113, 114 and 115. The import handler registers itself at boot when engage is mounted and pg-boss is on.
- **Next:** WP-10 (messaging core: adapter interface, message ledger, idempotency, mock adapter, DLR simulator).

## 2026-11-08 · WP-08 (Ingestion API v1)
- **Done:** migration `114_engage_events.sql` (partitioned `events`, `event_keys` for dedup, `trigger_outbox`); `POST /api/engage/v1/profiles:upsert`, `events:track` (batch of 500), `journeys/:key/trigger` (validates, answers 501 until WP-16), `GET openapi.json`; API-key auth with scopes and a per-key rate limit; profile service can now run inside a caller's transaction. Details in ADR-007 (implementation notes).
- **Verified:** `tsc` clean; full suite 1195 passed. 45 new tests (unit and real-Postgres over HTTP): duplicate event gives one row and one outbox row, also when replayed with another timestamp, within one batch, and the same id in another tenant is separate; rejected events leave no trace and can be resent corrected; cross-tenant profile ids rejected; events immutable, partitions unreachable except through the parent; no PII or keys in logs; OpenAPI matches the routes; limiter sits between authentication and scope on every route. Broke the migration and code 21 ways: all caught after two test additions (a lock on partition creation and strict consent bodies had survived).
- **Bug found by the tests and fixed:** two requests creating the same new month's partition at once could fail (the existence re-check after taking the lock did not see the other transaction's commit). Fixed before it ever reached a database.
- **Not done:** the pg-boss drain and trigger evaluation (WP-16), retention scheduling, shared rate-limit counter, SDKs.
- **For you:** run `npm run db:migrate` against production to apply 113 and 114. Then an ingest key can be created with `POST /api/engage/admin/organizations/:orgId/api-keys` (scopes `ingest`, optionally `journeys:trigger`).
- **Next:** WP-09 (CSV import and synthetic tenant generator).

## 2026-11-08 · WP-07 (Profiles, identifiers, consents, suppressions)
- **Done:** migration `113_engage_profiles.sql` (five RLS-forced tables), `engage/profiles.ts` (normalization, upsert with identifier history, consent ledger, suppression, fail-closed checks), read-only `GET /api/engage/profiles/:id`. Details in ADR-005 (implementation notes).
- **Verified:** `tsc` clean; 29 unit tests; 35 real-Postgres tests as the non-bypass role (identifier uniqueness and normalization in the DB, cross-tenant child rows refused, append-only ledger and suppressions, state only via trigger, late-arriving older consent, opt-out atomicity, 404 for another tenant's id, no emails or phones in logs); the isolation suite now covers all five tables. Full suite 1150 passed. Broke the migration 14 ways on fresh databases: 12 caught outright; 2 survived because a second layer catches the same thing (purpose CHECK repeated on `consent_state`; composite foreign key repeated on `consent_state`), and removing both foreign-key layers together was caught.
- **Not done:** events (WP-08), CSV import (WP-09), erasure (WP-35), IYS (WP-26), gate wiring (WP-11), any UI (WP-19).
- **For you:** run `npm run db:migrate` against production to apply 113 (additive; engage code does not need it until WP-08 uses it).
- **Next:** WP-08 (ingestion API), then WP-09.

## 2026-11-08 · Release safety (not a WP)
- **Done (PR #12):** CI job **Production build** (production env, the real `railway.json` build command, server and client); **Post-deploy smoke** workflow (fails loudly on a failed Railway deploy, otherwise runs `scripts/smoke-production.sh`, 12 read-only checks, also runnable by hand); `docs/runbooks/release-and-rollback.md`. Branch protection on `main`: PR required (0 approvals), checks "Type-check & test" and "Production build" required, no force-push or deletion, enforced for admins too.
- **Verified:** the old build command under production env reproduces the TS2688 outage (so the job would have failed on it); both CI jobs green on the PR; after merge, the smoke workflow triggered on Railway's success status and passed.
- **Not done:** backup restore never drilled (runbook says so); `ENGAGE_MASTER_KEY` backup outside Railway is on you; 40 npm vulnerabilities, secret scanning and Dependabot are a separate session. Admin enforcement means even you must open a PR for `main`; to bypass in an emergency, temporarily untick it in Settings, Branches.
- **Next:** WP-07, then WP-08, then WP-09.

## 2026-11-08 · WP-06 (Credential store)
- **Done:** migration `112_engage_channel_accounts.sql` (RLS-forced table; the engage role can read and insert but cannot edit secrets or delete rows); AES-256-GCM envelope encryption with a versioned master key and tenant/row binding (`engage/crypto.ts`); store with create, rotate (new row, old disabled), disable and a server-only loader (`credentials.ts`); tenant-admin API under `/api/engage/channel-accounts`; redacting engage logger plus redaction rules; master-key rotation job (`npm run engage:rewrap-keys`); production refuses to mount engage without a valid `ENGAGE_MASTER_KEY`. Details in ADR-006 (implementation notes).
- **Verified:** `tsc` clean; 29 crypto/redaction/validation unit tests; real-Postgres HTTP tests for write-only responses, cross-tenant 404s, admin-only on every route, rotation history, fail-closed decryption (tamper, moved ciphertext, wrong key, no key), immutability under the engage role, master-key rotation, and no secret, key, ciphertext or hash in any log or response. The isolation suite now covers the new table and loops over the whole schema. Real server boots: valid key mounts; malformed key or production without a key does not mount; master key never in the log. Broke the code and migration 24 ways; all caught except one equivalent case (binding on the secret layer alone, see ADR). A first mutation run stacked mutations because of my script (zsh word splitting); I reversed them exactly, proved it with the suite, and redid the run from git-index backups.
- **Not done:** provider-specific secret schemas (arrive with the adapters, WP-10/12/27/28); an audit trail beyond logs (WP-31); the send gate's use of `loadAccountSecrets` (WP-11).
- **Production (2026-11-08):** Hamza ran `npm run db:migrate`; 112 applied (114 rows in `schema_migrations`). Verified read-only: `channel_accounts` exists with RLS enabled and forced, one tenant policy, 0 rows; the engage role holds only SELECT and INSERT plus UPDATE on `status`, `wrapped_data_key`, `key_id` (not on secrets, config, owner or fingerprint) and cannot DELETE; the active-label unique index exists; role still login-enabled, not superuser, no bypass.
- **For you, before engage works in production:** run `npm run db:migrate` again (applies 112), and set `ENGAGE_MASTER_KEY` (`openssl rand -hex 32`) on the Railway API service, and back that key up somewhere outside Railway. Without it engage does not mount.
- **Next:** WP-07 (profiles, identifiers, consents), then WP-08, then WP-09 as you asked.

## 2026-11-08 · WP-03 (Migration baseline and single runner)
- **Done:** captured the production schema read-only (`pg_dump --schema-only`, no row data, using the `DATABASE_PUBLIC_URL` in `server/.env` with Hamza's go-ahead) and committed it as `server/src/migrations/000_baseline.sql` (ADR-010). The runner (`npm run db:migrate`) is now the only way to change schema: empty database gets the baseline; an existing database adopts it only if all 230 baseline tables exist, otherwise it refuses and writes nothing; per-migration transactions; advisory lock. Deleted the 110 legacy migrations, `server/src/db/migrations/` (24 files), `schema.sql` and the scripts that only applied them (`db:fix`, `db:add-tags`, `db:opportunity-hub`, `db:knowledge-v12`, `db:ensure-marketing-approval-queue`, `db:migrate-runner`). A test blocks new runtime DDL in TypeScript (12 pre-existing files frozen). CI database is now `pgvector/pgvector:pg17`.
- **Verified:** a fresh database built from the baseline matches production: text diff of `pg_dump -s` differs only in 96 CHECK expressions printed differently by Postgres 17.8 (prod) vs 17.11 (mine), and all 15 structural counts (tables, columns, indexes, constraints, policies, RLS flags, functions, materialized views, triggers, enums, sequences) are identical. Read-only check of the real database: all 230 tables present, so on production the runner will adopt the baseline and apply only migration 111. Runner tests on real Postgres: empty database, second run no-op, adoption, refusal when behind, rollback, recording atomicity, two runners at once. Broke the baseline, runner and DDL freeze 8 ways; all caught. Full suite stable over 4 runs.
- **Bugs found and fixed:** (1) the first baseline included the live `schema_migrations` table, so a fresh database failed; now excluded. (2) **WP-04 provisioning would have failed on production**: the real `reimbursement_users.tenant_id` is `NOT NULL` with no default and my stub table hid it. Fixed in `provisionOrganization.ts`; the engage tests now build the database with the real runner, so WP-04 and WP-05 are finally tested against the real schema.
- **Production deploy (2026-11-08):** Hamza ran `npm run db:migrate` against production. It adopted the baseline without running it and applied migration 111; 113 rows now in `schema_migrations`. Verified read-only afterwards: structure equals the baseline plus exactly `organizations.product` and its CHECK; `engage` has 3 tables, all with RLS enabled and forced, 0 rows; `engage.lookup_user` exists. The `messign_engage` role was then given a login with a generated password (stored only in the local gitignored `server/.env` as `ENGAGE_DATABASE_URL`). Verified as that role on production: passes the boot check, sees no rows without a tenant, denied on `reimbursement_users` and `employee_auth`. No tenants or data were created. Remaining for you: set `ENGAGE_DATABASE_URL` (same password, host `postgres.railway.internal:5432`) and `PRODUCT_SURFACE=all` on the Railway API service after the code is merged and deployed.
- **Earlier note, now superseded:** production had not been touched when this work was written. Running `npm run db:migrate` there will record the baseline (no DDL) and apply migration 111 (creates schema `engage`, role `messign_engage`, adds `organizations.product`). The baseline needs pgvector, so the database tests skip on Postgres 16 without it. `db/migrations/00x` RLS scripts and `db/scripts` role scripts are still outside the runner. Local developer databases that are behind will be refused by the runner and need recreating.
- **Next:** WP-06 (credential store).

## 2026-11-08 · WP-05 (Tenant-isolation adversarial harness)
- **Done:** shared real-Postgres fixture (two tenants plus a platform admin, connected as `messign_engage`); generic per-table suite that enumerates the `engage` schema; import-lint test for `server/src/engage/**`. Covers target-state section A: test 1 (read, update, delete, move and cross-insert per table), 2 (no tenant context, empty setting), 3 (ENABLE + FORCE RLS, `organization_id NOT NULL`, every policy bound to the tenant, no privileges on legacy tables), 4 (HTTP: claim or key decides the org, spoofed headers ignored, tenant admins blocked from platform routes, every route starts with an auth middleware), 7 (plaintext key, one-time password, their hashes absent from logs and later responses), 8 (A, B, A on one connection, failed transaction leaves no tenant). Adding an engage table without a seeder in `helpers/seeders.ts` fails the suite.
- **Verified:** `tsc` clean; suite stable over 3 consecutive runs on one scratch DB and leaves no rows. Broke the database 9 ways (permissive policy, bypass role, open key lookup, no insert guard, extra permissive SELECT policy, FORCE RLS dropped, new table without RLS, legacy grant, nullable `organization_id`) and the import lint 4 ways; each was caught, for the right reason. The fixture refuses to run if the legacy pool does not point at the scratch DB (it caught my own import-order mistake).
- **Not done:** target-state tests 5 (webhooks) and 6 (job payloads) need webhooks and the executor (WP-10, WP-16). Test 4's "user of A requesting B's id returns 404" has no tenant-owned id routes to hit yet; it applies from WP-07 on, and the route-guard check already forces authentication on any new route. Test 7's `channel_accounts` part lands with WP-06. CI Postgres runs as a superuser role; the engage role is what is tested, as intended.
- **Next:** WP-06 (credential store). WP-03 still waits for the schema dump.

## 2026-11-07 · WP-04 (Engage schema and tenancy foundation)
- **Done:** migration `111_engage_tenancy.sql` (schema `engage`, `organizations.product`, `tenant_settings`, `tenant_readiness`, `api_keys`, role `messign_engage` without login, FORCE RLS on all three tables). Engage pool and boot check (`engage/db.ts`), `requireEngageUser`, `requireApiKey`, `requirePlatformAdmin`, org provisioning and API key creation under `/api/engage`. Mounts only on surface `engage`/`all` and only if the role cannot bypass RLS. Design deviations are listed in ADR-002 (implementation notes).
- **Verified:** `tsc` clean; 23 unit tests; 13 real-Postgres tests (role boot check, schema guard, cross-tenant read/insert/update/delete, no-context reads, org switching on one connection, API key lookup, auth paths). I broke the migration 6 ways (permissive policy, BYPASSRLS role, open key lookup, missing WITH CHECK, extra grant, missing RLS) and the tests failed each time. A booted server and signed test tokens exercised 21 HTTP cases: two orgs provisioned, wrong or missing org claim rejected, key org taken from the key, revoked key rejected, no key or password in the log. Boot refuses to mount with a superuser role or no URL. CI now runs a Postgres 16 service for the real-Postgres tests.
- **Not done:** `channel_accounts` and envelope encryption (WP-06); the import-lint test and HTTP-level adversarial suite (WP-05, which also covers target-state tests 4 to 8 properly); per-key rate limiting (WP-08); `send_enabled` readiness constraint (WP-11/22). Not tested against a database built from the real legacy schema, because WP-03 (baseline) is blocked on the schema-only dump; the migration only needs `organizations`, `reimbursement_users` and `employee_auth`, which I checked against the repo's definitions. The CI Postgres service is untested until the PR runs. No real engage database role exists yet outside my scratch databases: you need to run `db/scripts/create_engage_role.sql` and set `ENGAGE_DATABASE_URL` per environment.
- **Next:** WP-05 (adversarial harness) then WP-06 (credential store); WP-03 when the dump arrives.

## 2026-11-07 · WP-02 (Repo cleanup + product surface)
- **Done:** removed `knowledge-hub/`, `knowledge-hub.zip/`, all `*.dump`, root ComfyUI/Python scripts and `server/db/` RLS-unblock SQL. `/api/seed` no longer mounts in production. Added `PRODUCT_SURFACE` and `VITE_PRODUCT_SURFACE` (default `workspace`, so current deploys are unchanged). On `engage`: frozen routers, modules and the budget and publisher jobs do not start; frozen nav, command items, mobile tabs and Company-OS widgets are hidden; frozen client paths redirect to `/marketing`. README and CLAUDE.md updated.
- **Verified:** `tsc` clean in both workspaces; server 955 passed / 9 skipped and client 560 passed with Postgres and Redis unreachable. Booted real servers: frozen API routes return 404 on `engage` and 401 on `workspace`; kept routes match on both; an invalid value stops boot. Browser check of the client on `engage` at desktop and mobile widths, using a fake local session.
- **Not done:** `dal/time` kept, because the Executive timesheet feature uses it (see decisions-pending). `organizations.product` is WP-04. BullMQ workers, pg-boss jobs and event subscribers still start on `engage`. Frozen features inside the marketing module (social publishing, competitor intelligence) are not split out. `/api/seed` production behaviour is unit-tested only, not boot-tested. Legacy client code still sends the ignored `X-User-Id` header, so CORS still allows it. A stray `.claude/worktrees/amazing-elion` gitlink remains tracked.
- **Blocker for you:** the repo is public and the removed dumps, which contain table data, remain in git history (see decisions-pending).
- **Next:** WP-03, blocked on the schema-only dump (`pg_dump -s`); otherwise WP-04.

## 2026-11-07 · WP-01 (Safety & CI baseline)
- **Done:** server `tsc` fixed (`gateway.ts:83` — `Anthropic.ContentBlockParam` no longer exported by installed SDK 0.32.1; retyped to `Array<TextBlockParam | ToolUseBlockParam>`, the two block kinds actually pushed). CI (`.github/workflows/ci.yml`) now runs on Node 22 (matches `.nvmrc`) and adds a `npm test` step (root → both workspaces) after type-check. `SEND_MODE` (ADR-004: `off` default/unset/invalid, `sandbox`, `live`) now gates every legacy marketing adapter (email, LinkedIn, X, Instagram, blog webhook) via `isSendModeLive()` in `adapterUtils.ts` — replaces the inconsistent per-adapter flags (`EMAIL_FORCE_REAL`, `X_FORCE_REAL`, `LINKEDIN_FORCE_MOCK`, bare token/webhook presence). `MARKETING_PUBLISHER_ENABLED` cron now defaults OFF (was default-on, opt-out). Removed the `x-user-id` header auth bypass entirely — `requireAuth`, `reimbursementAuth`, `adminAuth` (NODE_ENV-gated, so a non-production env was an open door — R10) and the always-on fallback in `routes/channels.ts` / `routes/chat.ts` (not even NODE_ENV-gated). `db:verify-rls` (`scripts/verifyRls.ts`) rewritten: requires a dedicated `RLS_VERIFY_DATABASE_URL` (never the app's superuser `DATABASE_URL`/`pool`), asserts the connected role has neither `BYPASSRLS` nor `SUPERUSER` before running the RLS check — fails closed with a clear message otherwise (D-07). Also fixed one pre-existing broken test (`marketingContentWorkflow.test.ts` — relied on the default `maxTruthRetries` before commit `d1e2d110` lowered it; made explicit in the test).
- **Verified:** server `tsc --noEmit` clean; server tests 933 passed / 9 skipped; client tests 556 passed, run with Postgres and Redis unreachable to match CI. `sendModeGate.test.ts` covers all 5 adapters. CI went red on the first push (3 tests needed a live Postgres/Redis, the A1 env-dependent failures); those tests now mock the dependency. The first local "green" only held because local Postgres and Redis were running.
- **Not done (explicitly out of scope — later WPs):** the `messign_engage` non-bypass role + pool itself (WP-04); the full send gate with `send_decisions`/consent/suppression (WP-11); `db:diagnose-rls` left as-is (diagnostic tool, not a pass/fail check).
- **Next:** WP-02 (repo cleanup + `PRODUCT_SURFACE` flag + CLAUDE.md refresh + README).


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
