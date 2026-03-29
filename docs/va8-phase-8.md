# VA2 Phase 8 — Value prop typography, HTML weight discipline, release/referral starters

## Goals

- **Baseline gaps [§20](./va2-pro-quality-baseline.md):** **Typography / spacing (#3–4)** — per-item **`value_prop`** headings and body copy respect `layoutDensity` via scaled type (parity with `product_grid`, CTA, Phase 7 social builders). **Template library (#6)** — two new starters (SaaS **release/changelog** + **referral/loyalty** nudge). **HTML weight (#8)** — strategist + docs on image-slot budget and export size; optional **validateManifest** warning when `target_image_slots` approaches the campaign cap.
- **Quality evidence:** Golden assembly for Phase 8 starters; strategist substring tests; client/server gates.

## Changelog (Phase 8)

| Date | Change |
|------|--------|
| 2026-03-28 | **Docs:** `va8-phase-8.md`; links from §24 baseline, README, product context, email pipeline. **Starters:** `saasProductReleaseChangelog.json`, `referralLoyaltyProgramNudge.json`; `registry.ts`; `LIST_VERSION` 14. **Strategist:** HTML weight / image budget; product changelog / release email; referral or loyalty patterns. **Builders:** `buildValuePropGrid` uses `scaledSubheadingFontSize` + `scaledBodyFontSize` for item copy. **Validation:** optional warning when `metadata.target_image_slots` ≥ 11. **Tests:** golden + `contentStrategistPrompt` Phase 8. |

## HTML weight and export size

- High **`target_image_slots`** plus many image-bearing sections increases generated HTML and resolve time. The client clamps slots **3–12** ([`emailManifestImageSlots`](../client/src/pages/marketing/lib/emailManifestImageSlots.ts)); the builder may show HTML weight hints ([`estimateUnlayerDesignHtmlWeight`](../client/src/pages/marketing/lib/estimateUnlayerDesignHtmlWeight.ts)).
- Prefer **distinct** `imagePrompt`s and fewer redundant visuals over maxing slots for every campaign.

## Related phases

- **Phase 7:** [va7-phase-7.md](./va7-phase-7.md) — B2B nurture + D2C cart recovery, testimonial/social_proof typography.
- **Phase 6:** [va6-phase-6.md](./va6-phase-6.md) — onboarding/transactional, short-preheader warning.

## Principles (unchanged)

- No breaking change to `POST .../resolve-email-images` or public marketing routes unless explicitly scoped.
- Token-safe colors via `designTokens` / `emailTypography`.
- Unlayer design JSON must round-trip; golden tests: `client/src/__tests__/pages/marketing/va2GoldenManifestAssembly.test.ts`.

## Out of scope (defer)

Video heroes; server-side image re-encoding; SMS/WhatsApp builders beyond strategist notes.
