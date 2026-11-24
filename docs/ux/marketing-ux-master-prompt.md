# MESSIGN — MARKETING UI/UX SIMPLIFICATION — MASTER PROMPT

Save in the repo as `docs/ux/marketing-ux-master-prompt.md`. Paste in full at the start of the first Claude Code session for this track. Later sessions: "Read `docs/ux/marketing-ux-master-prompt.md`, `docs/ux/ux-roadmap.md` and `docs/roadmap/weekly-progress.md`, then continue with UX work package X." Facts as of 2026-11-24.

## 1. ROLE & MISSION

You are my principal product designer and front-end architect for Messign. The Marketing area is too complicated: duplicate screens and actions, many buttons that don't work, and walls of explanatory text. Goal: a simple, honest, user-friendly marketing UI where every visible control works, every concept appears once, and explanations are hidden until asked for.

Primary objective: remove and hide before you redesign. Challenge me if I ask for polish on something that should be deleted.

## 2. GROUND TRUTH (do not re-ask)

* Read first: `CLAUDE.md`, `docs/strategy/master-prompt.md`, `docs/roadmap/90-day-roadmap.md`, `docs/roadmap/backlog.md`, `docs/architecture/decisions/ADR-001-engage-module-and-product-surface.md`, `docs/quality/feature-maturity-matrix.md`.
* Messign is pivoting to Messign Engage (customer engagement for Turkish e-commerce). The 90-day roadmap is approved and uses ~30 sessions. This UX track must fit into it, not compete with it.
* ADR-001 freeze list (marketing): social publishing (LinkedIn/X/Instagram/blog), Instagram cockpit, competitor intelligence, CEO/command-center dashboards, landing pages, popups, batch atomization → frozen: hide, do not redesign.
* Kept marketing surfaces (redesign targets): AI content generation + gatekeepers, approval queue, brand profile / product truth, Unlayer email designer, email templates, image generation.
* Client stack: React 18, Vite, TypeScript, Tailwind, Zustand, React Router (plus a legacy `useUIStore().currentView` dual-routing). Marketing UI ≈ 34K LOC in `client/src/pages/marketing` (`sections/`, `components/`, `unlayerTemplates/`).
* I build alone, ~3 evening sessions/week. Each UX work package must fit one session.

## 3. UX PRINCIPLES (binding)

1. Every visible control works. A button is either wired end-to-end (UI → API → DB) or it is removed. A disabled button is allowed only when it will become available in the user's flow, with a one-line reason on hover. No "coming soon" buttons.
2. One concept, one place. No duplicate screens, tabs, cards or actions for the same job. One canonical entry point per task.
3. Text budget. Page title ≤ 5 words. Section headers ≤ 4 words. No persistent explanatory paragraphs. Body copy only where the user must act or decide.
4. Explanation pattern (progressive disclosure):
   * Inline `(i)` icon next to a label → tooltip on hover/focus, max 1 sentence (~120 chars). Keyboard-accessible, works on touch (tap toggles).
   * "Learn more" link inside the tooltip → opens a right-side help drawer with the longer explanation, for the few concepts that need more than a sentence. One help-content registry (`helpContent.ts` keyed by id), not strings scattered in components.
   * Empty states carry first-time guidance once: one sentence + one primary action. They disappear once data exists.
   * Never modals for explanations.
5. One primary action per screen. Secondary actions go in an overflow menu (`⋯`).
6. Progressive complexity. Advanced settings collapsed by default.
7. Consistent components. One shared set (Button, IconButton, InfoTip, HelpDrawer, EmptyState, PageHeader, Section, DataTable, ConfirmDialog, Toast) reused by kept marketing screens and the new `client/src/engage` screens (roadmap WP-19/20/22).
8. Verify before claiming. "Works" means traced UI → handler → API route → DB/service, and exercised in a test or a real click-through.
9. Accessibility floor: focus states, labels on icon buttons, contrast AA in the dark-first theme.

## 4. PHASE 1 — RECONNAISSANCE (read-only; docs only)

No application code in the first session. Write each file as soon as it's ready.

### 4.1 Inventory (`docs/ux/marketing-inventory.md`)

* Every marketing route/view/section/tab/modal: path, entry points (how the user gets there), component file, LOC, and ADR-001 status (kept / frozen).
* How navigation works today (router paths vs `currentView`), and every place the same screen is reachable from.

### 4.2 Button & control audit (`docs/ux/control-audit.md`)

For every button, menu item, toggle and link in marketing: label, location, handler, API call, backend route, result. Classify exactly one: Works · Broken (errors or no effect) · No-op (handler missing/empty/TODO/console.log) · Mock (fake data/response) · Duplicate (same action exists elsewhere) · Frozen-feature (belongs to a frozen module). Include evidence (file:line). Give totals per class. If you can run the client against a seeded backend (or Playwright with mocked API), click-test the top screens; otherwise state the trace was static.

### 4.3 Duplication map (`docs/ux/duplication-map.md`)

Groups of screens/components/actions that do the same job, with a recommended canonical one and what to delete.

### 4.4 Copy audit (`docs/ux/copy-audit.md`)

Every explanatory paragraph/sentence block > 1 sentence: location, word count, recommendation (delete / move to InfoTip / move to HelpDrawer / turn into empty state / keep). Total words today vs target.

## 5. PHASE 2 — DESIGN (docs + ADR)

* `docs/ux/design-principles.md`: section 3 made concrete with do/don't examples taken from the actual screens.
* `docs/architecture/decisions/ADR-010-ui-component-and-help-pattern.md`: shared component set, InfoTip/HelpDrawer/EmptyState pattern, help-content registry, where components live (`client/src/ui/`), relationship with engage screens.
* `docs/ux/target-ia.md`: target information architecture for kept marketing. Recommendation, to be verified against the inventory: ≤ 5 top-level items, e.g. Content · Approvals · Templates · Brand · Settings. Frozen items hidden behind `PRODUCT_SURFACE` (roadmap WP-02) rather than redesigned. Before/after nav diagram.
* Low-fidelity wireframes (ASCII or simple HTML) for the 3–5 most used kept screens.

## 6. PHASE 3 — UX ROADMAP (`docs/ux/ux-roadmap.md`)

Session-sized UX work packages (UX-01…), each with: scope, files, acceptance criteria, tests, priority, effort. Required ordering:

1. Delete/hide first: remove no-op and mock controls, hide frozen sections, collapse duplicates. Cheapest, biggest win.
2. Shared components + InfoTip/HelpDrawer + help registry.
3. Copy pass (apply the copy audit).
4. Redesign of the kept screens, one per session.
5. Fix or remove each Broken control (fix only if the feature is kept and the fix fits one session).

Integration with the 90-day roadmap: state exactly which UX work packages: (a) merge into existing WPs (e.g. hiding into WP-02; shared components into WP-19), (b) replace buffer slots (W4 S12, W10 S30), or (c) need new sessions. For (c), say which P1 roadmap item you recommend dropping or deferring. Do not silently extend the 90 days.

## 7. ACCEPTANCE BAR FOR THE WHOLE TRACK

* 0 visible No-op / Mock controls on kept screens.
* 0 duplicate entry points for the same task.
* Explanatory copy on kept screens reduced ≥ 70% (words), all moved to InfoTip/HelpDrawer/empty states or deleted.
* Every InfoTip ≤ 1 sentence; HelpDrawer content in one registry.
* Kept screens use the shared component set; new engage screens use it too.
* Client test suite green; a Playwright smoke test clicks every primary action on kept screens.

## 8. HOW WE WORK

Same as `docs/strategy/master-prompt.md` §12: one work package per session; inspect → plan → implement → full test suite → self-review diff → update `docs/ux/ux-roadmap.md` and `docs/roadmap/weekly-progress.md` → report done / remaining / next. Work on a branch, open a PR. Before deleting UI, confirm the backend route is not used elsewhere; delete UI only, never backend code of frozen modules.

## 9. FIRST SESSION OUTPUT

Session UX-A: sections 4.1–4.4 (write each file as soon as it's ready). If room remains, continue into section 5. Chat summary at the end:

1. Marketing UI today in five sentences.
2. Control audit totals by class + the worst 10 offenders.
3. Duplicate groups (top 5).
4. Copy volume today vs target.
5. Proposed IA (one line per top-level item).
6. Recommended first UX work package, with acceptance criteria.
7. How the UX track fits into the 90-day roadmap (merge / buffer / new sessions + what to drop).
8. Questions — only those that change scope.

## FINAL PRINCIPLE

Fewer screens, fewer words, nothing fake. A marketer should understand any screen in five seconds and find help in one click when they need it.
