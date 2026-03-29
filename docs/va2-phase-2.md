# VA2 Phase 2 — Lucy / Unlayer pro parity (implementation)

**Status:** Implemented — closes gaps from [va2-pro-quality-baseline.md](./va2-pro-quality-baseline.md) §20–21 (see changelog).  
**Prerequisites:** [MESSIGN_PRODUCT_CONTEXT.md](./MESSIGN_PRODUCT_CONTEXT.md), [email-design-pipeline.md](./email-design-pipeline.md).

## Goals

- Richer **promotional** manifests (section mix, image slots, distinct prompts).
- **Non-blocking validation warnings** for thin layouts when `visual_density` is not `minimal`.
- **Hero layout** option for taller editorial photography (`heroLayout: editorial_tall`).
- **Expanded starters** (D2C + B2B) in [`unlayerTemplates/registry.ts`](../client/src/pages/marketing/unlayerTemplates/registry.ts).
- **Regression tests** (golden manifest assembly).
- **Image resolve** dedupe + tighter campaign context on the server.
- **Docs:** export weight, Outlook overlay QA, template licensing.

## Changelog

| Date | Change |
|------|--------|
| 2026-03-28 | Initial Phase 2 doc: validation warnings, metadata merge, strategist rules, starters, `heroLayout`, server dedupe, UI merge of manifest warnings. |
| 2026-03-28 | Linked from baseline §24 and README; pipeline doc cross-link; three new registry starters; golden assembly test; campaign raster keywords from non-hero image prompts. |

---

## Layout density and typography

| `layoutDensity` (manifest / legacy meta) | Use when |
|-------------------------------------------|----------|
| **airy** | Promotional campaigns: more vertical spacing between sections; pair with `metadata.target_image_slots` 6+ and multiple `image_text` / grids. |
| **normal** | Default balance. |
| **compact** | Dense transactional or legal content; often with `visual_density: minimal`. |

Theme **typography** (fonts, sizes) comes from [`designTokens.ts`](../client/src/pages/marketing/lib/designTokens.ts) per `ThemeName`. Density mainly affects **section padding** in assembly, not font families.

---

## Export weight and image heuristics

- **Countable image slots:** clamp **3–12**; default target **6** when omitted (`target_image_slots`).
- **HTML size:** Very large exports (many full-width images, long copy) can hit client paste limits or slow sends. Aim for **under ~200KB** HTML for typical campaigns where possible; prefer compressed hosted images (HTTPS URLs from resolve pipeline), not giant inline blobs.
- **Generation cost:** More slots = more `resolve-email-images` work; keep prompts distinct to avoid redundant generations.

---

## Outlook QA checklist (paper plane + complex rows)

- [ ] **MSO:** Decorative plane uses conditional comments — verify static fallback in Word-based Outlook.
- [ ] **`:has()`:** Fallback block present for clients without `:has()` (see pipeline doc §12).
- [ ] **Mobile:** Overlay row hidden on narrow (`hideMobile`); confirm no horizontal scroll.
- [ ] **Reduce motion:** `@media (prefers-reduced-motion: reduce)` shows static asset where applicable.
- [ ] **Clipping:** Complex nested tables — spot-check hero + overlay in **Outlook 2019+** or new Outlook.

---

## Third-party template licensing (HTML import)

Unlayer’s **public gallery** and third-party HTML are usually **copyrighted**. Do not bulk-import gallery HTML into the product for redistribution without a **license** or **original export** you own. Prefer **Messign-authored** manifest starters (`manifest` field → `runEmailAssemblyPipeline`) or **your own** Unlayer Studio exports stored under `client/public/marketing/unlayer/`. When using `htmlImportUrl`, document asset ownership in your release notes.

---

## Related

- [va2-pro-quality-baseline.md](./va2-pro-quality-baseline.md) — rubric and Phase 1 baseline.
- [va2-baseline-archive/README.md](./va2-baseline-archive/README.md) — optional exports and sign-off.
