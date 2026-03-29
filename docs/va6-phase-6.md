# VA2 Phase 6 — Onboarding / transactional depth, typography polish, template breadth

## Goals

- **Industry gap #4 ([baseline §20–22](./va2-pro-quality-baseline.md)):** Deepen **onboarding / lifecycle** and **transactional / system** email coverage in starters and strategist guidance so they match D2C/events depth where appropriate.
- **Typography / rhythm (#3–4):** Align **standalone `image`** and **`cta`** builders with `layoutDensity` and `layoutVariant` patterns used by `image_text` (band / card / flush, density-aware padding and scaled copy).
- **Template library (#6):** Add two registered manifest starters — **onboarding lifecycle (deep)** and **transactional lifecycle (compact)** — and bump `LIST_VERSION` in `client/src/pages/marketing/unlayerTemplates/registry.ts`.
- **Quality evidence:** Golden assembly snapshot for a Phase 6 starter, strategist prompt tests for new strings, and validation / a11y coverage as noted below.

## Changelog (Phase 6)

| Area | Change |
|------|--------|
| Docs | This hub; links from [§24 baseline](./va2-pro-quality-baseline.md), [README](../README.md), [product context](./MESSIGN_PRODUCT_CONTEXT.md), [email pipeline](./email-design-pipeline.md). |
| Starters | `onboardingLifecycleDeep.json`, `transactionalLifecycleCompact.json` in `unlayerTemplates/starters/`, registered in `registry.ts`. |
| Strategist | `marketingContentStrategistPrompt.ts`: **onboarding welcome series** narrative; **transactional / minimal `visual_density`** patterns (order, copy, avoid rich promotional triggers). |
| Builders | `buildImageBlock`: density + variant parity; scaled caption rhythm. `buildCTASection`: density-aware vertical rhythm vs `image_text`. |
| Validation | Non-breaking **warning** when `preheader` (trimmed) is **shorter than 40 characters** and `metadata.visual_density` is not `minimal` (transactional minimal layouts may use short preheaders intentionally). |
| Tests | `va2GoldenManifestAssembly.test.ts` Phase 6 starter; `contentStrategistPrompt.test.ts`; `validateManifest.test.ts` short preheader; optional a11y/assembly assertion. |

## Related phases

- **Phase 5:** [va5-phase-5.md](./va5-phase-5.md) — product/value/text/divider parity, duplicate `imagePrompt` warnings, D2C/events strategist, `eventsSummitDeep`, `d2cSeasonalFlashDeep`.
- **Phase 4:** [va4-phase-4.md](./va4-phase-4.md) — export/Outlook, licensing, B2B starters.
- **Phase 3:** [va3-phase-3.md](./va3-phase-3.md) — `layoutDensity`, split hero, resolve idempotency.

## Principles (unchanged)

- No breaking change to `POST .../resolve-email-images` or public marketing routes unless explicitly scoped.
- Token-safe colors via `designTokens` / `emailTypography`; no arbitrary hex in builders.
- Unlayer design JSON must round-trip; client golden tests live under `client/src/__tests__/pages/marketing/va2GoldenManifestAssembly.test.ts` (`cd client && npm test`).

## Out of scope (defer)

Video heroes; full shadcn sheet migration; server-side image re-encoding; full SMS/WhatsApp builders (field notes in strategist only).
