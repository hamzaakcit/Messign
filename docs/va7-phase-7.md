# VA2 Phase 7 — B2B nurture depth, D2C recovery, hero/social typography

## Goals

- **Baseline gaps [§20](./va2-pro-quality-baseline.md):** Address **manifest depth (#1)** and **template library breadth (#6)** with two new starters; strengthen **hero diversity (#2)** and **LLM variance (#7)** via explicit strategist rules and golden assembly coverage.
- **Typography (#3–4):** Apply **density-scaled** typography in **`testimonial`** and **`social_proof`** (metrics) builders so quote, attribution, and metric numbers align with `layoutDensity` like `image_text` / `cta`.
- **Industry focus ([§22](./va2-pro-quality-baseline.md)):** **B2B SaaS / newsletter** (thought-leadership nurture arc) and **D2C ecommerce** (abandoned cart / recovery) — complementary to Phase 6 onboarding/transactional depth.
- **Quality evidence:** Golden snapshots / assembly tests for new starters; strategist prompt substring tests; full client/server gates.

## Changelog (Phase 7)

| Date | Change |
|------|--------|
| 2026-03-28 | **Docs:** hub + links from §24 baseline, README, product context, email pipeline. **Starters:** `b2bThoughtLeadershipNurture.json`, `d2cAbandonedCartRecovery.json`; `registry.ts`; `LIST_VERSION` 13. **Strategist:** hero layout diversity; B2B thought-leadership nurture; abandoned cart / browse recovery; campaign / UTM discipline. **Builders:** `socialBuilders.ts` testimonial + social proof metrics + footer lines use density-scaled typography. **Tests:** golden snapshots + `contentStrategistPrompt` Phase 7 strings. **Validation:** no new manifest warning (rich section mix stays strategist-first vs thin-promotional warnings). |

## Related phases

- **Phase 6:** [va6-phase-6.md](./va6-phase-6.md) — onboarding/transactional starters, image/CTA parity, short-preheader warning.
- **Phase 5:** [va5-phase-5.md](./va5-phase-5.md) — product/value/text/divider parity, D2C/events strategist.
- **Phase 4:** [va4-phase-4.md](./va4-phase-4.md) — export/Outlook, licensing.

## Principles (unchanged)

- No breaking change to `POST .../resolve-email-images` or public marketing routes unless explicitly scoped.
- Token-safe colors via `designTokens` / `emailTypography`; no arbitrary hex in builders.
- Unlayer design JSON must round-trip; golden tests: `client/src/__tests__/pages/marketing/va2GoldenManifestAssembly.test.ts`.

## Out of scope (defer)

Video heroes; new `validateManifest` rules that duplicate **thin promotional** warnings; SMS/WhatsApp builders beyond strategist field notes.
