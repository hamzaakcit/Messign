# VA2 Phase 9 — Text block density parity, partner + gift starters, Outlook cross-link

## Goals

- **Baseline gaps [§20](./va2-pro-quality-baseline.md):** **Typography / spacing (#3–4)** — standalone **`text_block`** body copy respects `layoutDensity` via **`scaledBodyFontSize`** (parity with `value_prop`, `image_text`, CTA). **Template library (#6)** — two new starters (**partner co-marketing / joint webinar** + **D2C seasonal gift guide**). **Edge clients (#10)** — strategist points to **Outlook / layered backgrounds** QA via [va4-phase-4.md](./va4-phase-4.md). **Subject length (#inbox)** — soft **`validateManifest`** warning when `subject` exceeds typical mobile truncation (~55 chars), aligned with [`TYPICAL_SUBJECT_MAX`](../client/src/pages/marketing/lib/emailInboxPreview.ts).
- **Quality evidence:** Golden assembly for Phase 9 starters; strategist substring tests; client/server gates.

## Changelog (Phase 9)

| Date | Change |
|------|--------|
| 2026-03-28 | **Docs:** `va9-phase-9.md`; links from §24 baseline, README, product context, email pipeline. **Starters:** `partnerCoMarketingWebinar.json`, `d2cSeasonalGiftGuide.json`; `registry.ts`; `LIST_VERSION` 15. **Strategist:** partner/co-marketing + joint webinar; seasonal gift guide editorial rhythm; Outlook overlay QA → Phase 4 doc. **Builders:** `buildTextBlock` uses `scaledBodyFontSize` for paragraph `font-size`. **Validation:** non-blocking warning when `subject` length exceeds `TYPICAL_SUBJECT_MAX` (55). **Tests:** golden + `contentStrategistPrompt` Phase 9. **Optional:** `buildTextBlock` unit test documents density scaling vs golden-only coverage. |

## Subject line length (mobile preview)

- Many clients truncate subjects around **50–60 characters**. The strategist recommends **40–60** chars for optimal display; **`validateManifest`** emits a **warning** (not an error) when `subject` is longer than **`TYPICAL_SUBJECT_MAX` (55)** so authors can front-load keywords.

## Outlook / layered backgrounds

- Complex **hero backgrounds**, **overlays**, and **full-bleed imagery** need extra verification in **Outlook** desktop. Follow the checklist and notes in [va4-phase-4.md](./va4-phase-4.md) (Phase 4 export polish and Outlook QA).

## Related phases

- **Phase 8:** [va8-phase-8.md](./va8-phase-8.md) — value_prop density typography, HTML weight, release/referral starters.
- **Phase 4:** [va4-phase-4.md](./va4-phase-4.md) — Outlook QA, export polish, licensing notes.

## Principles (unchanged)

- No breaking change to `POST .../resolve-email-images` or public marketing routes unless explicitly scoped.
- Token-safe colors via `designTokens` / `emailTypography`.
- Unlayer design JSON must round-trip; golden tests: `client/src/__tests__/pages/marketing/va2GoldenManifestAssembly.test.ts`.

## Out of scope (defer)

Video heroes; server-side image re-encoding; SMS/WhatsApp builders beyond strategist notes.

## Test coverage note (text_block)

- **Golden assembly** on Phase 9 starters exercises `text_block` in realistic manifests. Optional **`buildTextBlock`** unit tests assert scaled `font-size` in generated HTML for a fixed theme + `layoutDensity` when incremental regression coverage is desired.
