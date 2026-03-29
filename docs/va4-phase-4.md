# VA2 Phase 4 — Export polish, Outlook QA, licensing, starters, validation depth

**Status:** Implemented.  
**Prerequisites:** [va2-pro-quality-baseline.md](./va2-pro-quality-baseline.md), [va2-phase-2.md](./va2-phase-2.md), [va3-phase-3.md](./va3-phase-3.md), [email-design-pipeline.md](./email-design-pipeline.md), [MESSIGN_PRODUCT_CONTEXT.md](./MESSIGN_PRODUCT_CONTEXT.md).

## Goals

- **Export awareness:** Estimated HTML size plus **HTTP URL count** in the email builder pipeline strip (hosted assets drive real weight).
- **Policy:** Document **hosted images**, **compression**, and **max width** expectations; align with Phase 2 export-weight notes.
- **Outlook and overlays:** Canonical **QA checklist** for paper-plane and complex rows (MSO, `:has`, mobile, reduced motion).
- **Licensing:** Single canonical pointer for **third-party HTML / Unlayer gallery** imports (no redistribution without rights).
- **Manifest depth:** Strategist guidance for **B2B newsletter** section mix; validation warnings aligned with thin promotional layouts.
- **Starters:** Two new industry-aligned manifest starters (B2B newsletter depth, D2C ecommerce lookbook).
- **Builders:** `layoutVariant` and `layoutDensity` behavior for **footer**, **testimonial**, and **social_proof**.

## Changelog

| Date | Change |
|------|--------|
| 2026-03-28 | Phase 4: `docs/va4-phase-4.md`, pipeline strip URL count, export/image policy, Outlook checklist, licensing section, strategist B2B newsletter notes, thin-layout warning copy, starters `b2bSaaSNewsletterDeep` + `d2cEcommerceLookbook`, golden + validateManifest tests, overlay HTML invariant test, footer/social/testimonial builder pass. |

## Export weight, images, and compression

**Canonical Phase 2 notes:** [va2-phase-2.md § Export weight and image heuristics](./va2-phase-2.md#export-weight-and-image-heuristics).

**Phase 4 policy (engineering):**

1. **Prefer HTTPS URLs** from the resolve pipeline (`POST .../resolve-email-images`) over giant inline `data:` images — keeps HTML smaller and improves caching.
2. **Typical campaign HTML** — aim **under ~200KB** uncompressed where possible; the builder shows a **heuristic KB** and **unique HTTP URL count** as early warning, not a hard block.
3. **Compression** — serve images from your CDN or storage with **reasonable dimensions** (e.g. hero width aligned to ~600px logical email width); avoid 4K bitmaps inlined or linked without resize parameters if your host supports `?w=` / `?width=` style transforms.
4. **Slot budget** — `metadata.target_image_slots` is clamped **3–12**; more slots increase generation time and export size.

## Outlook and paper-plane QA checklist

Manual spot-check before high-stakes sends when **motion overlay** or **complex nested tables** are present:

- [ ] **MSO:** Decorative overlay uses conditional comments — verify static fallback in Word-based Outlook.
- [ ] **`:has()`:** Fallback behavior acceptable in clients without `:has()` (see [email-design-pipeline.md](./email-design-pipeline.md)).
- [ ] **Mobile:** Overlay row respects `hideMobile` where set; no horizontal scroll on narrow viewports.
- [ ] **Reduce motion:** `@media (prefers-reduced-motion: reduce)` paths show static or simplified motion where implemented.
- [ ] **Clipping:** Spot-check hero + overlay in **Outlook 2019+** or **new Outlook**.

Implementation detail: phantom overlay HTML is generated in [`client/src/pages/marketing/lib/overlayEngine.ts`](../client/src/pages/marketing/lib/overlayEngine.ts) (`generateOverlayHTML`, `buildOverlayRow`).

## Third-party templates and HTML import (licensing)

**Summary:** Unlayer’s **public gallery** and third-party HTML are usually **copyrighted**. Do not bulk-import gallery HTML into Messign for **redistribution** as product templates without a **license** or **original export you own**.

**Practice:**

- Prefer **Messign-authored** VA2 manifests (`manifest` field → `runEmailAssemblyPipeline`) under `client/src/pages/marketing/unlayerTemplates/starters/`.
- For `htmlImportUrl` flows, document **asset ownership** in release notes; use only assets you have rights to ship.

Related: [va2-phase-2.md § Third-party template licensing](./va2-phase-2.md#third-party-template-licensing-html-import).

## layoutDensity and builders (Phase 4)

[`layoutDensity`](./va3-phase-3.md) continues to drive typography and default section spacing in [`designAssembler.ts`](../client/src/pages/marketing/lib/designAssembler.ts). Phase 4 ensures **footer**, **testimonial**, and **social_proof** respect **`section.variant`** (`card` | `band` | `flush`) where applicable and apply **density**-aware vertical padding consistent with other builders.

## Related

- [va2-phase-2.md](./va2-phase-2.md) — pro parity, export weight, Outlook stub, licensing stub.
- [va3-phase-3.md](./va3-phase-3.md) — density, resolve ops, HTML size heuristic.
- [email-design-pipeline.md](./email-design-pipeline.md) — assembly entry points and overlay notes.
- [MESSIGN_PRODUCT_CONTEXT.md](./MESSIGN_PRODUCT_CONTEXT.md) — product layers and channel-agnostic manifest fields.
