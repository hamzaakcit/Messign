# UX Roadmap: Marketing

**As of:** 2026-11-24. Master prompt: `docs/ux/marketing-ux-master-prompt.md`. Principles: `design-principles.md`. Components and help: ADR-026. Structure: `target-ia.md`.

## Status

| ID | Package | Status |
|---|---|---|
| UX-A | Reconnaissance: inventory, control audit, duplication map, copy audit | done 2026-11-24 |
| UX-01 | Delete and hide: frozen screens, 38 unreachable files, Mock and No-op controls, Unlayer setup text | done 2026-11-24 (PR #68) |
| UX-01b | Lucy composer down to Instagram + email (no frozen-channel templates); engage tab label contrast; Phase 2 docs; UX-D1 (engage sections light on paper) and UX-D2 (Builder email-only) applied | done 2026-11-24 (PR #69) |

## Next packages (one session each)

| ID | Package | Files | Acceptance | Tests | Pri | Replaces |
|---|---|---|---|---|---|---|
| UX-02 ✅ done 2026-11-24 | **Help pattern.** `InfoTooltip` tap/Escape/`helpId`; `HelpDrawer`; `lib/helpContent.ts`; apply the copy-audit **T**/**H** moves | `components/ui/InfoTooltip.tsx`, new `HelpDrawer.tsx`, `lib/helpContent.ts`, `EmailDesignWizard`, `Va2DiagnosticsPanel`, `TenantContentSetupPanel`, `MarketingChannelAgentModal` | No explanatory block > 1 sentence visible by default on kept screens; every tip ≤ 120 chars | Registry test (one sentence, ≤ 120, every used id exists); InfoTooltip keyboard + tap | P0 | — (new) |
| UX-03 ✅ done 2026-11-24 | **Tokens.** Ban bare `text-app`/`bg-app` in marketing + engage (104 uses). Theme is decided (UX-D1: paper; engage sections in the light theme, done in UX-01b) | `pages/marketing/**`, `engage/**` | Lint-style test green; selected/hover states pass AA on their real background | Class-ban test; contrast spot checks in the browser | P0 | MC-15 |
| UX-04 ✅ done 2026-11-25 | **One offer list.** Pipeline becomes the status view of Offers; `/marketing/content` and `/pipeline` redirect | `LucyMarketingPage`, `MarketingPipelinePage`, `KanbanBoard`, router | One list of content; old URLs land on it with the filter set | Router + list tests | P1 | MC-09 |
| UX-05 | **Shop settings page.** Replaces the Brands FAB (done) | `TenantContentSetupPanel`, `BrandProfileManager`, router | No floating button; truth rows edited in one place | Page test | P1 | MC-11 |
| UX-06 ✅ done 2026-11-25 | **Offer detail redesign.** One primary ("Looks good"), `⋯` for the rest; journey email readable without Unlayer | `ContentDetailPanel`, `OfferDetailView`, `ContentEmailSection` | One filled button; email subject, price, window and unsubscribe visible | Component tests; browser click-through | P0 | MC-07, MC-08 |
| UX-07 ✅ done 2026-11-25 | **Calendar takes ready offers.** Live-publish warning only when `SEND_MODE=live` | `ContentCalendarTab` | A draft can't be dropped on a day | Drop-rule test | P0 | MC-10 |
| UX-08 | **Leftover duplicates.** (done) `ContentCreatePanel` Instagram preset → New offer; "Draft journey email" only when no email child; inline `UnlayerEmailEditor`; trim unused channel forms from `MarketingChannelAgentModal` | named files | `duplication-map.md` groups 3, 7 and 9 closed | Existing tests updated | P1 | — (new, small) |
| UX-09 | **Smoke test.** Playwright clicks every primary action on Offers, New offer, Offer detail, Calendar, Email designs, Shop settings (mocked API) | `e2e/` | Runs in CI | the spec itself | P0 | MC-16 (partly) |

Order: UX-02 → UX-03 → UX-06 → UX-07 → UX-04 → UX-05 → UX-08 → UX-09. Fix-or-remove for Broken controls (master prompt step 5) has nothing to do: the audit found none.

## Fit with the 90-day roadmap

The Engage plan is almost through (WP-01…27, 29, 30, 33, 36–39 done; WP-40 in progress; WP-31, 34, 35 todo; WP-28 blocked; WP-32 P1). The UX track **takes no Engage session.**

- **(a) Merged into existing packages:** UX-01 absorbed **MC-13** and **MC-14** (frozen links and sandbox out of the nav). UX-03/04/05/06/07 replace **MC-15, MC-09, MC-11, MC-07+08, MC-10**.
- **(b) Buffer slots:** none used. The 90-day buffers (W4 S12, W10 S30) are in the past and were spent on Engage.
- **(c) New sessions:** UX-02, UX-08, UX-09 (3). They come out of the marketing-counter evening slot, not the Engage plan. MC had 11 rows left; after the mapping above, MC keeps MC-12, MC-16 and MC-17. So MC + UX ≈ 3 + 8 = 11 sessions, the same budget as before. **Nothing in the Engage plan is dropped or deferred.**

MC-12 (a campaign is a name on a set of offers), MC-16 (dogfood one bookstore and one florist offer) and MC-17 (cut list) stay on the MC track, after UX-06.

## Decisions for the founder

| ID | Question | Outcome |
|---|---|---|
| UX-D1 | One theme on `/marketing`? | **Paper everywhere** (2026-11-24). The engage tab row, sections, create actions and panels render under `data-theme="light"` on the shop counter. The tenants' own engage page (`EngageHub`) keeps the dark theme |
| UX-D2 | Keep "Documents" in the builder? | **Hidden** (2026-11-24). The Builder is email-only; `/marketing/documents` redirects there; the backend stays |

## Acceptance bar for the track (from the master prompt)

| Bar | Now |
|---|---|
| 0 visible No-op / Mock controls on kept screens | **met** (UX-01) |
| 0 duplicate entry points | 0 left in marketing (UX-08 done) |
| Explanatory copy −70% | **met**: visible-by-default text ≈ 400 → 40 words (UX-02) |
| InfoTips ≤ 1 sentence, one registry | **met** (`lib/helpContent.ts`, enforced by `helpContent.test.ts`) |
| Kept screens and engage on one component set | UX-02, UX-03 |
| Playwright smoke clicks every primary action | UX-09 |
