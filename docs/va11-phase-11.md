# VA2 Phase 11 — Hero diversity (split + editorial_tall) and starter exemplars

## Goals

- **Baseline gaps [§20](./va2-pro-quality-baseline.md):** **Hero diversity (#2)** and **spacing rhythm (#4)** — ship **two** new manifest starters that showcase **`heroLayout: split`** (B2B product narrative) and **`heroLayout: editorial_tall`** (D2C magazine-style hero) with strong non-hero rhythm (`image_text`, `value_prop`, `product_grid` as appropriate).
- **Builders:** [`heroBuilder.ts`](../client/src/pages/marketing/lib/blockBuilders/heroBuilder.ts) — headline, subhead, and CTA paths already use **density-scaled** typography (`scaledHeroHeadlineFontSize`, `scaledSubheadingFontSize`, `scaledCtaFontSize`); Phase 11 documents this parity (no behavioral change required unless regression tests surface gaps).
- **Registry:** [`LIST_VERSION` 16](../client/src/pages/marketing/unlayerTemplates/registry.ts).

## Changelog (Phase 11)

| Date | Change |
|------|--------|
| 2026-03-28 | **Docs:** `va11-phase-11.md`; cross-links. **Starters:** `b2bSplitHeroProductStory.json`, `d2cEditorialTallLookbook.json`. **Strategist:** split vs editorial_tall vs default hero guidance; repo doc pointer `docs/va11-phase-11.md`. **Tests:** golden + `contentStrategistPrompt` Phase 11. **heroBuilder:** JSDoc remarks for scaled typography (audit closure). |

## Related phases

- **Phase 10:** [va10-phase-10.md](./va10-phase-10.md) — rich `visual_density` validation.
- **Phase 9:** [va9-phase-9.md](./va9-phase-9.md) — text_block density.

## Principles (unchanged)

- Unlayer design JSON must round-trip; token-safe colors.

## Out of scope (defer)

Video heroes; new hero layouts beyond split / editorial_tall / default.
