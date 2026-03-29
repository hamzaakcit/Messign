# VA2 Phase 13 — Unlayer-gallery parity sprint (industry starters + depth)

## Goals

- **Baseline [§20](./va2-pro-quality-baseline.md):** Close gaps **#1** (manifest depth), **#2** (hero diversity), **#6** (template library breadth), **#8** (HTML weight awareness) via **four new industry-aligned starters**, **strategist** guidance for **Unlayer-category parity**, **validateManifest** nudges for **thin promotional** manifests, **enrichment** + **resolve** duplicate-prompt surfacing, **builder** rhythm, **Lucy** quick actions + **wizard** goals, and **export UX** copy.
- **Licensing:** Do **not** import or ship **Unlayer public gallery** HTML as Messign templates without rights — use **original** Design Manifest JSON only ([va4](./va4-phase-4.md), [va12](./va12-phase-12.md)).

## Changelog (Phase 13)

| Date | Change |
|------|--------|
| 2026-03-28 | **Starters:** `realEstateOpenHouseListing.json`, `nonprofitImpactGivingCampaign.json`, `foodHospitalityChefTableNight.json`, `musicEntertainmentTourNight.json`; `registry.ts` `LIST_VERSION` **18**; categories `real_estate`, `nonprofit`, `food`, `music`. **Strategist:** Unlayer-category parity (Phase 13) block + `docs/va13-phase-13.md` pointer. **Validation:** `pushThinPromotionalManifestWarnings` — distinct section count when **hero** present (non-transactional). **Enrichment:** extended scene hints + slot salt. **Server:** `promptDuplicateWarnings` on `resolve-email-images` response. **UX:** `UnlayerTemplatePicker` filters; `EmailPipelineStatusStrip` HTML weight tiers; Lucy quick actions (newsletter depth, flash grid, event invite); wizard goals + `GOAL_TO_TEMPLATE` for four verticals. **Builders:** `image_text` band + airy rhythm padding. **Tests:** golden ×4, `validateManifest`, strategist Phase 13. |

## Related phases

- [va9](./va9-phase-9.md) … [va12](./va12-phase-12.md)

## Principles (unchanged)

- Token-safe colors; Google Fonts; `runEmailAssemblyPipeline` round-trip; **no** wholesale gallery HTML import.

## Out of scope (defer)

Video heroes; server-side image re-encoding beyond existing pipeline; SMS/WhatsApp builders beyond strategist notes.
