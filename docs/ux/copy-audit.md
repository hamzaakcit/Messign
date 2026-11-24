# Copy Audit

> **Update 2026-11-24 (UX-02 done):** every **D**, **T** and **H** item below has been applied. The ones that still had text went to `client/src/lib/helpContent.ts`, shown through `InfoTooltip` (and `HelpDrawer` for "Learn more"). The Lucy greeting no longer pitches Messign to every shop. The content form's "Draft with Marketing agent" button said it opened Lucy, but it opens New offer; its label now says so. Explanatory text **visible by default** on reachable marketing screens went from about 400 words (535 minus about 90 behind `<details>` and 45 in error states) to about 40, roughly a 90% cut. Measured over every word including gated and error text, the cut is about 67%.

**As of:** 2026-11-24, `main`. Session UX-A, read-only. Scope: every explanatory block (more than one sentence, or one sentence of process explanation) in `client/src/pages/marketing/**`. Labels, button text and one-line error messages are out of scope.

## Headline

**The marketing UI does not have a wall-of-text problem. It has a wrong-audience problem.** Explanatory copy on reachable screens totals about **535 words**. The worst blocks are developer notes shown to shop staff: Unlayer env-var setup, "VA2 email design manifest JSON", "re-assembles from the manifest". The ≥70% target in the master prompt is close (≈65% from this audit alone), and most of it comes from deleting text, not moving it.

## Liveness check

Blocks in unreachable files are deleted with the file. They are not copy work. They were checked with `grep -rlw <Name> client/src` (no importers outside the file itself):

| Dead file | Words | Note |
|---|---|---|
| `lib/lucyHubSectionCopy.ts` (whole file) | 68 | Copy registry for four "hub sheets"; never imported |
| `components/instagram/InstagramConnect.tsx:69` | 26 | Component has no importers |
| `components/CeoDashboard.tsx:149` | 11 | Screen has no route (also frozen, ADR-001) |
| `components/InstagramAgentPromptModal.tsx:272,275,349,448,452,495,578` | 114 | Replaced by `NewOfferPage` (MC-02); referenced only in comments and a test |

A subagent reported `RepurposeModal`, `EmptyContextPanel` and the Instagram modal as live. They are not. The first two are imported only from `components/cockpit/ContentDetailPanel.tsx` and `cockpit/CockpitContextPanel.tsx`, which nothing live reaches. See `duplication-map.md` §A.

## Live blocks

R = recommendation: **D** delete · **T** move to InfoTip (≤1 sentence, ~120 chars) · **H** move to HelpDrawer · **E** turn into empty state · **K** keep.

| File:line | Text (abridged) | Words | When shown | R |
|---|---|---|---|---|
| `UnlayerEditor.tsx:478` (+3 near-identical variants for web/document/popup) | "Design in the visual builder, then apply… Set `VITE_UNLAYER_PROJECT_ID` locally and in Vercel; add your production domain under Unlayer → Project → Deployment → Allowed Domains." | 32 × 4 ≈ 128 | Always, header of every builder | **D** (ops instructions; belong in `DEPLOYMENT.md`) |
| `EmailDesignWizard.tsx:255` | "Apply AI draft builds the layout from your text… Use template loads a professional starter… (fixes mismatched themes like Mother's Day vs generic 'product launch')." | 40 | Step 3, when an AI draft exists | **T** ×2, one per button |
| `cockpit/Va2DiagnosticsPanel.tsx:200` (live, via `ContentEmailUnlayerControls`) | "Brand lock: edits in Unlayer stay in the exported design until you regenerate AI images below (that re-assembles from the manifest)…" | 30 | Always, ungated | **T** |
| `cockpit/Va2DiagnosticsPanel.tsx:112` | "Static fallback when recipients use 'reduce motion'; some clients clip CSS — see email pipeline docs." | 16 | When motion overlay is on | **H** (points to docs the user cannot reach) |
| `UnlayerEditor.tsx:503` | "This campaign has HTML only (no saved Unlayer design). The builder opens blank…" | 32 | Legacy HTML-only content | **H** |
| `ContentCreatePanel.tsx:87` | "Instagram draft — Saved as workspace content. Schedule and publish from the board or calendar; live posting uses your connected accounts…" | 25 | Instagram preset | **D** (it describes frozen publishing) |
| `LucyGreetingCard.tsx:94,106` | "Messign's marketing-native specialist…" / "Let's scale Messign. What growth lever…" | 25 | Lucy drawer, always | **D** for e-commerce tenants (Messign's own B2B pitch shown inside Kitapyurdu's shop) |
| `MarketingChannelAgentModal.tsx:188` | "Describe audience and offer. Lucy will request a VA2 email design manifest JSON for the builder." | 16 | Channel modal intro | **T** (drop "VA2 … manifest JSON") |
| `EmailDesignWizard.tsx:138` | "Your draft looks seasonal — Seasonal Campaign is pre-selected…" | 17 | Seasonal detection only | K |
| `TenantContentSetupPanel.tsx:16` | "Each org keeps its own brand, language, handle, and three product-truth rows. Publish stays off." | 15 | Brands panel header, always | **T** |
| `ContentCreatePanel.tsx:158` | "Opens Lucy with the Instagram prompt helper. Paste the result into the body when ready." | 15 | Under Lucy-draft button | K |
| `CompetitorManager.tsx:281,345` | URL hint; empty state | 23 | Intel (frozen) | — frozen screen, hidden not edited |
| `BrandProfileManager.tsx:312` | "No brand profiles yet. Create one to start managing brand voice consistency." | 13 | Empty state | K (already the right pattern) |
| `Va2DiagnosticsPanel.tsx:84,211,262`, `lib/a11yExplainEmail.ts:7` | Density hint; WCAG explanation; regenerate explanation | 90 | Behind `<details>` or conditional | K (already progressive disclosure) |
| `UnlayerEditor.tsx:666`, `ContentEmailUnlayerControls.tsx:606` | Load-timeout / error | 45 | Errors only | K |

## Smaller copy defects found by the control audit

- `components/approval/ReviewDetail.tsx:72` — the toggle label reads **"Revision history (mock v1 → v2)"**. The data is real, so the label is a stale dev string that makes real data look fake. The screen is unreachable today (see `control-audit.md`), so fix it if the approval queue is brought back.
- `command-center/columns/BrandSocialColumn.tsx:42` — "Refresh data" is wired to a prop called `onReconnectSocial`. The social "Vibe score" is permanently `connected: false` (`server/src/services/marketing/commandCenterAggregator.ts:335`). The screen is frozen, so hide it rather than fix it.

## Totals

| | Words visible by default |
|---|---|
| All explanatory copy in the tree | ≈ 650 |
| Of which on reachable screens | ≈ 535 |
| After **D** items (Unlayer env-var intro, Instagram-preset note, Messign pitch in Lucy) | ≈ 355 |
| After **T** and **H** moves (text leaves the main flow) | ≈ 205 |
| After hiding the frozen Intel screen | ≈ 185 |
| **Reduction on reachable screens** | **≈ 65%**, under the 70% bar |

Getting past 70% needs one more trim of the "keep" set when each kept screen is redesigned (for example, a button's helper sentence becomes that button's InfoTip). That is redesign work, not a separate copy session.

## Recommendation for the roadmap

A separate "copy pass" package (master prompt §6 step 3) is **not worth a session**. Most of the reduction is deletion that happens anyway in the delete-first package. The InfoTip moves need the InfoTip component, so they belong in the shared-components package.
