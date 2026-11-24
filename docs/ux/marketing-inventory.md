# Marketing Inventory

> **Update 2026-11-24 (later the same day):** rows 7–11 (Intel, Brand & social, Funnel, Campaigns & lab, Lucy sandbox), the CEO dashboard, Builder's landing-page and popup types, the calendar funnel strip, and Atomize were **removed from the client**. Their paths redirect to `/marketing` (pages and popups go to Builder). The backend is unchanged. The table below is the state before that removal.

**As of:** 2026-11-24, `main`. Session UX-A, read-only. Scope: `client/src/pages/marketing/**` (≈190 files, **35,942 LOC** per `find … | wc -l`, excluding `*.test.*`).

**Important ground truth this inventory must not ignore:** a *different*, already-in-progress track — the **marketing counter** (`docs/roadmap/marketing-counter-120-day.md`, MC-01…MC-17, started 2026-11-14) — has already rebuilt `/marketing` once: MC-01 through MC-06 are **done**. The screens below are described as they exist **today**, post-MC-06, not as some older "Lucy chat hub" snapshot. See `docs/ux/duplication-map.md` and the chat summary for how this UX track and the MC track relate — they are not the same thing and risk duplicating each other if not reconciled.

## How navigation works today

- Router: React Router, mounted by `MarketingLayout.tsx` → `MarketingRouter()`. No `currentView`/`useUIStore` dual-routing inside marketing (confirmed: `grep -rn "currentView\|useUIStore" client/src/pages/marketing` → 0 hits). Routes are the single source of truth here.
- Two layout shells:
  - **Hub** (`/marketing` exactly): `LucyMarketingPage.tsx`, no `WorkspaceTopBar`. Renders directly inside `MarketingLayout`'s `ViewportContainer`.
  - **Workspace** (`/marketing/{pipeline,content,calendar,builder,intelligence,brand-social,funnel,experiments,sandbox}`): wrapped in `MarketingWorkspaceLayout.tsx`, which renders `WorkspaceTopBar.tsx` (an 8-tab bar: 4 "primary" + 4 "CC" grouped under a dropdown) above an `<Outlet/>`.
- A third, independent nav surface exists on the hub itself: the **"More" menu** inside `LucyMarketingPage.tsx` (`MORE_LINKS`), which lists the same 8 workspace destinations **plus is the only visible entry point to them from the home screen** — `WorkspaceTopBar` is only visible once you're already inside a workspace route.
- Legacy path redirects (all in `MarketingLayout.tsx`'s `MarketingRouter`): `/marketing/lucy`, `/workspace`, `/executive`, `/agent` → hub. `/campaigns` → `/marketing/experiments`. `/email`, `/pages`, `/popups`, `/documents` → `/marketing/builder?type=…`. `/command-center`, `/dashboard`, `/creative-hub`, `/automation`, `/leads`, `/approvals` → `/marketing/pipeline`. Unknown segment → hub. These are intentional, already-cut redirects (good — nothing to remove here, they're the right pattern).
- A fourth nav surface floats outside the router entirely: the **"Brands" FAB** (`BrandsFab` in `MarketingLayout.tsx`), a fixed bottom-right button on every marketing screen that opens a slide-over with `TenantContentSetupPanel` + `BrandProfileManager`.

## Top-level entry points (what a marketer can reach)

| # | Path | Screen / component | LOC | Entry points (how you get there) | ADR-001 status |
|---|---|---|---|---|---|
| 1 | `/marketing` | `LucyMarketingPage.tsx` — shop counter: offer list for selected shop, New offer, More, Ask Lucy | 194 | App nav → Marketing; default redirect target for ~10 legacy paths | **Kept** (content generation / shop counter) |
| 2 | `/marketing/offer/new` | `NewOfferPage.tsx` — 5-step new-offer wizard (product, picture, words, preview, Looks good) | 481 | "New offer" button on hub; `location.state.openInstagramAi` redirect from Dora | **Kept** |
| 3 | (slide-over, no path of its own; opens over `/marketing` or `/marketing/pipeline`) | `components/ContentDetailPanel.tsx` — content detail | 653 | Click an offer row on hub; click a card on Pipeline board | **Kept** |
| 4 | `/marketing/pipeline`, `/marketing/content` (same route) | `components/MarketingPipelinePage.tsx` → `KanbanBoard`/`BoardCard` | 43 (+board) | "More → Pipeline" on hub; `WorkspaceTopBar` "Pipeline" tab; ~6 legacy redirects land here | **Kept**, but see duplication map — this is a second, older "all content" board sitting next to the hub's own offer list |
| 5 | `/marketing/calendar` | `sections/ContentCalendarTab.tsx` + `components/FunnelStrip.tsx` | 329 + 133 | "More → Calendar"; `WorkspaceTopBar` "Calendar" tab | Calendar = **Kept**; `FunnelStrip` (leads/funnel data bolted onto the calendar) = **frozen-adjacent**, belongs to Engage per MC plan |
| 6 | `/marketing/builder` | `sections/BuilderSection.tsx` (email / landing page / popup / document) | 513 | "More → Builder"; `WorkspaceTopBar` "Builder" tab; builder redirects from `/email`, `/pages`, `/popups`, `/documents` | Email builder = **Kept**; landing page / popup / document builders = **Frozen** (ADR-001: landing pages, popups) |
| 7 | `/marketing/intelligence` | `components/CompetitorDashboard.tsx` (+ `CompetitorEventCard`, `CompetitorManager`) | 521 | "More → Intel"; `WorkspaceTopBar` "Intel" tab | **Frozen** (ADR-001: competitor intelligence) |
| 8 | `/marketing/brand-social` | `MarketingCommandCenter.tsx` (column mode) → `command-center/columns/BrandSocialColumn.tsx` | 250 (+55) | "More → Brand & social"; `WorkspaceTopBar` CC dropdown | **Frozen** (ADR-001: CEO/command-center dashboards; social-publishing parts also frozen) |
| 9 | `/marketing/funnel` | `MarketingCommandCenter.tsx` (column) → `columns/FunnelColumn.tsx` | 250 (+56) | "More → Funnel"; `WorkspaceTopBar` CC dropdown | Not explicitly in the ADR-001 freeze list by name, but MC plan says "Funnels and leads belong to Engage" — **candidate to hide**, needs a decision (see Questions) |
| 10 | `/marketing/experiments` | `MarketingCommandCenter.tsx` (column) → `columns/ExperimentsColumn.tsx` | 250 (+61) | "More → Campaigns & lab"; `WorkspaceTopBar` CC dropdown | `/marketing/campaigns` also redirects here. MC plan: "a campaign is a name on a set of offers," no dedicated command-center column — **candidate to hide/replace** |
| 11 | `/marketing/sandbox` | `MarketingCommandCenter.tsx` (column) → `columns/StrategySandboxColumn.tsx` | 250 (+27) | "More → Lucy sandbox"; `WorkspaceTopBar` CC dropdown | MC-14 already plans to remove this from nav entirely — **candidate to hide now** |
| — | (FAB, any screen) | `BrandProfileManager.tsx` + `TenantContentSetupPanel.tsx` | 349 + ? | "Brands" floating button, every marketing screen | **Kept** (brand profile / product truth) — but MC-11 plans to replace this FAB with a proper "Shop settings" screen |

## Screens with no route (unreachable)

A whole-app import walk from `App.tsx` found **38 of 182 marketing files unreachable (≈ 6,900 LOC)**. The screen-level ones:

- `MarketingApprovalQueuePage.tsx` and its `components/approval/*`: `/marketing/approvals` redirects to the pipeline.
- `MarketingLeadsPage.tsx`: `/marketing/leads` redirects to the pipeline.
- `components/CeoDashboard.tsx`: no route at all.
- `components/InstagramAgentPromptModal.tsx` (615 LOC): replaced by `NewOfferPage` (MC-02).
- `components/instagram/InstagramConnect.tsx`: nothing renders it, so no UI can save Instagram credentials today.
- `components/DoraDrawer.tsx`: replaced by `DoraRail.tsx`.
- `sections/CampaignsSection.tsx`: `/marketing/campaigns` redirects to experiments.
- 14 of the 17 files in `components/cockpit/`. Only `InstagramPreview.tsx` and `Va2DiagnosticsPanel.tsx` are live.

`components/InstagramCockpit.tsx` (1,043 LOC) **is live**: `InstagramStudio.tsx` renders it inside the offer detail. Full list: `duplication-map.md` §A.

## Non-route surfaces worth tracking

- **Lucy / Dora rail & drawer** (`components/DoraRail.tsx`, `components/DoraDrawer.tsx`) — the "Ask Lucy" affordance, present on the hub as a drawer, not a route. Explanation-pattern relevant: this is where a lot of the "walls of text" risk concentrates (chat-style assistant copy).
- **Command-center infrastructure** (`MarketingCommandCenter.tsx`, `command-center/CommandCenterToolbar.tsx`, `command-center/DoraPlayCard.tsx`, `command-center/tiles/MetricTile.tsx`) backs all four CC columns (#8–11 above). Its data comes from `MarketingContext` (`ccData`, fetched on every marketing page load). `command-center/useMarketingCommandCenterData.ts` is an unused older hook. Hiding the columns does not stop the context from fetching command-center data; that fetch should go with them.
- **Unlayer email design** (`components/UnlayerEditor.tsx`, `UnlayerEmailEditor.tsx`, `UnlayerTemplatePicker.tsx`, `EmailDesignWizard.tsx`, the whole `lib/blockBuilders/**` tree, `unlayerTemplates/registry.ts`) — the single largest "Real" and "Kept" asset per the feature-maturity matrix. Out of scope for deletion; in scope for the copy/explanation pass (Unlayer wizards are a classic source of multi-paragraph onboarding text).

## What this inventory deliberately does not re-litigate

- Backend route structure (`/api/marketing/*`) — covered as evidence in the control audit, not duplicated here.
- Whether Instagram *content generation* (stills/captions on an offer) counts as frozen "Instagram cockpit" under ADR-001 — it does not; ADR-001's freeze is about **real publishing/scheduling to the live Instagram account and the old intelligence UI**, not AI-assisted content creation, which is explicitly a kept capability and is in fact the backbone of the shop-counter offer flow. Flagged as a scope question regardless, because `InstagramCockpit.tsx`'s 1,043 lines mix both concerns and need the control audit to say which parts are which.
