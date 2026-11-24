# Control Audit

> **Update 2026-11-24 (UX-01 done):** all Frozen-feature controls (#6, #9, #10, command center, Intel, funnel strip) are removed. All Mock controls (#1–#5) are removed. No-op #7 (campaign Edit) is removed. #8 (review→ready on a content card) now shows "This card can't move there." The Builder image Generate was **not** a visible No-op; the editor never registers it without a callback, so this audit overcounted it. The "Build email layout" duplicate banner is removed. Still open: duplicates #1–#3 and #8–#10 in `duplication-map.md`, the Lucy composer channel tiles, and the Instagram test-publish safety finding.

**As of:** 2026-11-24, `main`. Session UX-A, read-only. **The trace was static:** every control was followed from its handler to `client/src/lib/marketingApi/*` to `server/src/routes/marketing/*.ts` and then to the DAL or service. Nothing was click-tested against a running backend. Disputed claims were re-read in source (marked ✔).

**Scope:** controls on **reachable** screens only. Of 182 marketing source files, 38 are unreachable from `App.tsx` (see `duplication-map.md` §A). Their controls are not counted; they are deleted with the file.

## Totals (reachable controls)

| Class | Count | Notes |
|---|---|---|
| Works | ≈ 68 | Real UI → API → DAL. Includes Unlayer email designer, offer flow, calendar, brand profiles |
| **Mock** | **6** | Each one tells the user something happened that did not |
| **No-op** | **3** | |
| Duplicate | 6 | |
| Frozen-feature | ≈ 33 | Five screens one tap from the home, plus builder types and atomize |
| Broken | 0 | None confirmed |
| Ambiguous | 1 group | Lucy composer tiles for LinkedIn / X / blog / ads / metrics |

## Worst offenders (ranked)

| # | Control | Where | Class | Evidence | Why it matters |
|---|---|---|---|---|---|
| 1 | **Send** (email campaign) | `EmailCampaignDetailPanel.tsx:118`, `sections/BuilderSection.tsx:331` | Mock | ✔ `server/src/dal/marketing/emailCampaigns.ts:265-290` sets `status='sent'`, `delivered = recipient_count`; no ESP call, no `SEND_MODE` check | Reports 100% delivery for an email nobody received. Fake analytics feed later decisions |
| 2 | **Drag card to "Live"** | Pipeline board, `MarketingContext.tsx:241-246` | Mock | ✔ `publishContent` → `server/src/dal/marketing/content.ts:656-669` flips `status='published'`; no adapter | A draft becomes "Published" with a success toast. Nothing was posted |
| 3 | **Publish** (rocket) | `ContentDetailPanel.tsx:571-583` | Mock + frozen | same DAL as #2 | Same lie as #2, and it targets frozen LinkedIn/X/blog publishing |
| 4–5 | **Auto-schedule** (two call sites) | `ContentDetailPanel.tsx:593`, `ContentCalendarTab.tsx:188` | Mock | `server/src/services/marketing/instagramIntelligence.ts:230-244` `OPTIMAL_SLOTS` is a fixed table | Presented as Lucy's analysis of the audience; it is a hard-coded guess |
| 6 | **More → Intel / Brand & social / Funnel / Campaigns & lab / Lucy sandbox** | `LucyMarketingPage.tsx:13-22`, and again in `WorkspaceTopBar.tsx:38-50` | Frozen-feature | Routes render `CompetitorDashboard` and `MarketingCommandCenter` | The simplified home links straight back into the frozen Company-OS dashboards, from two menus |
| 7 | **Edit** (campaign) | `CampaignDetailPanel.tsx:161-163` | No-op | ✔ `<button>` with no `onClick` | A dead primary-looking button |
| 8 | **Drag review → ready** (plain content card) | `MarketingContext.tsx:235-240` | No-op | ✔ only `card.type === 'approval'` is handled; content cards refresh and snap back with no message | Fails silently on the board's main gesture |
| 9 | **Atomize to channels** | `ContentDetailPanel.tsx:602-608` → `BatchPanel` → `POST /batch` | Frozen-feature | ADR-001: batch atomization | Opens a frozen B2B workflow from inside the kept offer screen |
| 10 | **Builder: New → Landing page / Popup / Document** | `BuilderSection.tsx:188-219` | Frozen-feature | ADR-001: landing pages, popups | Three of the builder's four types are frozen |

Also: the **AI image "Generate"** modal in `UnlayerEditor.tsx:708-756` cannot open from `/marketing/builder` because `BuilderSection` never passes `onRegenerateImage` (No-op on that screen; it works inside the offer's email section). The **Brand & social "Refresh data"** button is wired to `onReconnectSocial`, but the social score is fixed at `connected: false` (`server/src/services/marketing/commandCenterAggregator.ts:335`). That screen is frozen, so hide it rather than fix it.

## Safety finding (not a UX defect, but found here)

**Instagram "Test publish" ignores `SEND_MODE` once an org has saved credentials.** ✔ `server/src/routes/marketing/content.ts:938` sets `live = Boolean(saved) || instagramPublishMode() === 'live'`, and `instagramAdapter.ts:77` accepts `input.live === true`. The WP-01 progress entry records this as deliberate ("A studio Instagram share with saved credentials still posts when SEND_MODE is unset"). Today it is only latent, because the only UI that saves credentials (`InstagramConnect.tsx`) is unreachable. It still contradicts the CLAUDE.md non-negotiable "every send goes through the send gate". It belongs to the Engage send-gate work (WP-11), not to this UX track. It is listed under Questions in the session summary.

## Per-screen detail

### Shop counter `/marketing` (`LucyMarketingPage.tsx`) — kept
| Control | Class | Evidence |
|---|---|---|
| New offer (header) | Works | → `/marketing/offer/new` |
| New offer (empty state) | Works | Same action, correct empty-state pattern, not a defect |
| More (toggle) | Works | Local state |
| More → Pipeline, Calendar | Works | Kept destinations |
| More → Builder | Works / partly frozen | Email kept; landing page / popup / document frozen |
| More → Intel, Brand & social, Funnel, Campaigns & lab, Lucy sandbox | **Frozen-feature** | see #6 |
| Ask Lucy | Works | Opens `DoraRail` |
| Offer tile | Works | Opens `ContentDetailPanel` |
| Try again | Works | `GET /content` ×2 |

### New offer `/marketing/offer/new` (`NewOfferPage.tsx`) — kept
All controls Works: step fields, reference photo upload (`POST /content/lucy-reference-upload`), Back, Next (validates per step), **Looks good** (`createInstagramOfferPair` → `POST /content` + `POST /content/:id/journey-email`; drafts only). "Back to offers" duplicates closing the page; harmless.

### Content / offer detail (slide-over, `components/ContentDetailPanel.tsx`) — kept
| Control | Class | Evidence |
|---|---|---|
| Retry, Regenerate image, Format feed/story/reel, Variant select, Upload reference, AI photo edit | Works | `content.ts:471-629` (regenerate, reference, Kontext edit) |
| Draft journey email | Works / Duplicate | The product-drop and occasion recipes already create it at save |
| Looks good (submit for review), Draft | Works | `PUT /content/:id`, server-side truth and voice checks |
| Scheduled toggle, Schedule (clock), Confirm | Works | `POST /content/:id/schedule` |
| Test publish | Works, safety flag | see Safety finding |
| **Publish (rocket)** | **Mock** | #3 |
| **Auto-schedule (zap)** | **Mock** | #4 |
| **Atomize to channels** | **Frozen-feature** | #9 |
| Sibling-offer nav buttons | Duplicate | Same as the child row on the offer tile |

### Pipeline `/marketing/pipeline` = `/marketing/content` (`MarketingPipelinePage` → `KanbanBoard`) — kept, but duplicates the home list
| Control | Class |
|---|---|
| Card click | Works |
| Drag draft → review | Works (`submit_for_review`) |
| Drag review → ready (approval card) | Works (`approveItem`) |
| **Drag review → ready (content card)** | **No-op** (#8) |
| **Drag → live** | **Mock** (#2) |

### Calendar `/marketing/calendar` (`ContentCalendarTab.tsx` + `FunnelStrip.tsx`) — kept calendar, frozen-adjacent strip
Prev / Next / Today, Month / Week / List, cell click → `ContentCreatePanel` → `POST /content`, drag-to-reschedule, item click: Works. **Auto (list row)**: Mock (#5). FunnelStrip expand and hot-lead chip: Works, but lead and funnel data belong to Engage (MC-13). Remove the strip from this page.

### Lucy rail (`DoraRail.tsx`) — kept as help
Send, Stop, Clear: Works (real chat). Composer **Instagram** tile duplicates New offer. **LinkedIn / X / blog / ads / metrics** tiles: *ambiguous*. They only draft chat text, so they are not frozen to the letter, but they target channels whose publishing is frozen and that are outside the Instagram + email offer model.

### Builder `/marketing/builder` (`BuilderSection.tsx`) — email kept, the rest frozen
Filter chips, New dropdown, row click, Save, Create: Works for email (`/emails`), **Frozen-feature** for landing page / popup (`/pages`, `/popups`) and arguably document. **Send**: **Mock** (#1). Unlayer Apply, Change template, Retry: Works. AI image Generate: No-op here. Record metrics, calibration (`CampaignMetricsPanel.tsx`): Works, with manually typed numbers.

### Offer email section (`ContentEmailSection` → `ContentEmailUnlayerControls.tsx`) — kept
Design, Open builder, Apply AI draft, Save template (`POST /templates`), theme / variant / effects, Download HTML, Export QA bundle, Cancel, Save to content: Works. "Build email layout" banner = Duplicate of the Apply-AI-draft button (same handler, `:367` vs `:350`). The error boundary's "Close and retry" only closes the panel.

### Campaign / lead / email-campaign slide-overs — not part of the shop-counter model
Campaign create / launch / pause / complete / record spend: Works. **Edit: No-op** (#7). Lead score / qualify / convert to CRM / disqualify: Works (B2B lead model; belongs to Engage or frozen CRM). Email campaign Edit in builder: Works. **Send: Mock** (#1).

### Command-center columns `/marketing/{brand-social,funnel,experiments,sandbox}` — frozen
Refresh, 7/14/30-day chips, brand filter, Pipeline / Builder / Intel shortcuts, experiment row → detail, "Execute with Lucy": all wired (`GET /dashboard/command-center`), all **Frozen-feature**. The "Lucy sandbox plays" are static server heuristics (`commandCenterAggregator.ts:373-423`), not model output.

### Intelligence `/marketing/intelligence` (`CompetitorDashboard`, `CompetitorManager`, `CompetitorEventCard`) — frozen
About 12 controls (Manage, Scrape all, filters, CSV, Load more, competitor CRUD, Scrape now, AI analysis toggle). Real pg-boss scraping. All **Frozen-feature**.

### Brands FAB → `TenantContentSetupPanel` + `BrandProfileManager` — kept
FAB, content-tenant select (sessionStorage + event), brand profile create / edit / delete (`/brand-profiles`), palette tags: Works. Placement is the issue (a floating button over every screen), not wiring. MC-11 already plans to replace it with Shop settings.

## Not counted: controls on unreachable screens
The approval-queue page (Approve, Request revision, filters; real `POST /approvals/:id/review`), the leads page (bulk qualify / convert), `CeoDashboard`, `InstagramConnect`, `InstagramAgentPromptModal`, `DoraDrawer`, and the `cockpit/` cluster. Their handlers are mostly real; nobody can click them. One stale label is noted in `copy-audit.md` (`ReviewDetail.tsx:72`, "mock v1 → v2").
