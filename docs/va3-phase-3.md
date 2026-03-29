# VA2 Phase 3 — Layout depth, resolve ops, export UX

**Status:** Implemented.  
**Prerequisites:** [va2-pro-quality-baseline.md](./va2-pro-quality-baseline.md), [va2-phase-2.md](./va2-phase-2.md), [email-design-pipeline.md](./email-design-pipeline.md), [MESSIGN_PRODUCT_CONTEXT.md](./MESSIGN_PRODUCT_CONTEXT.md).

## Goals

- **layoutDensity** (`airy` | `normal` | `compact`) on VA2 manifests drives **typography scale** and **section padding rhythm** in assembly (distinct from `metadata.visual_density`, which controls auto-insertion of image sections).
- **Hero variety:** optional `heroLayout: split` — copy column + image column (token-safe).
- **Image resolve:** Redis-backed **idempotency** for multi-replica APIs; **bulk** worker runs the same resolve pipeline per content row.
- **Export UX:** estimated **HTML payload size** in the email builder strip (heuristic).
- **Regression:** second golden manifest test; server tests for idempotency.

## Changelog

| Date | Change |
|------|--------|
| 2026-03-28 | Phase 3: `layoutDensity`, density type scale helpers, split hero, starters (webinar + onboarding), HTML size estimate + UI, Redis idempotency, bulk resolve pipeline, docs + tests. |

## layoutDensity vs metadata.visual_density

| Field | Meaning |
|-------|---------|
| **`layoutDensity`** (manifest root) | Typography scale and vertical spacing between sections: `airy` (roomy), `normal` (default), `compact` (dense). |
| **`metadata.visual_density`** | `minimal` = do not auto-enrich with extra `image_text`; `rich` = allow client enrichment toward `target_image_slots`. |

They compose: e.g. transactional email can be `compact` + `visual_density: minimal`.

## Related

- [va2-phase-2.md](./va2-phase-2.md) — Phase 2 validation warnings and starters.
- [email-design-pipeline.md](./email-design-pipeline.md) — assembly pipeline entry points.
- [MESSIGN_PRODUCT_CONTEXT.md](./MESSIGN_PRODUCT_CONTEXT.md) — which manifest fields are channel-agnostic vs email-first.
