# VA2 Phase 5 — Gallery depth, builder parity, strategist tuning

**Status:** Implemented.  
**Prerequisites:** [va2-pro-quality-baseline.md](./va2-pro-quality-baseline.md), [va2-phase-2.md](./va2-phase-2.md), [va3-phase-3.md](./va3-phase-3.md), [va4-phase-4.md](./va4-phase-4.md), [email-design-pipeline.md](./email-design-pipeline.md), [MESSIGN_PRODUCT_CONTEXT.md](./MESSIGN_PRODUCT_CONTEXT.md).

## Goals

- **Builder parity:** `layoutDensity` and `section.variant` (`card` | `band` | `flush`) applied consistently to **product_grid**, **value_prop**, **text_block**, and **divider** rows (Phase 4 covered footer, testimonial, social_proof).
- **Hero rhythm:** Density-aware vertical padding on hero rows (photo and solid) complements existing `scaledHeroHeadlineFontSize` / subhead scaling.
- **Strategist:** Stronger **D2C ecommerce** guidance (product_grid waves, distinct prompts) and **events / webinar** narrative (agenda blocks + registration CTA).
- **Validation:** Non-blocking **duplicate `imagePrompt`** warning when the same prompt string is reused across multiple image slots.
- **Starters:** Two new high-depth manifests (events/webinar + D2C seasonal/flash) registered in the Unlayer starter list.
- **Tests:** Golden assembly snapshot, `validateManifest` duplicate-prompt case, strategist substring tests, hero density padding/font assertions.

## Changelog

| Date | Change |
|------|--------|
| 2026-03-28 | Phase 5: `docs/va5-phase-5.md`, builder parity (product/value/text/divider), hero density padding, duplicate imagePrompt warnings, strategist D2C + events notes, new starters, tests, doc links. |

## Omnichannel field notes (SMS / WhatsApp / push)

Manifest fields that can inform **non-email** channels later (no SMS/WhatsApp builders in this repo yet):

| Manifest field | Typical email use | Future channel mapping |
|----------------|-------------------|-------------------------|
| `subject`, `preheader` | Inbox | Push title + subtitle; SMS first segment (shortened) |
| `metadata.tone`, `metadata.audience` | Strategist / brand | Tone for SMS/WhatsApp copy |
| `sections[].type`, headline/body text | Unlayer rows | Narrative order for multi-bubble WhatsApp sequences (manual mapping) |
| `theme`, `artDirection` | Visual theme | Brand voice; image style for MMS or link previews |
| `layoutDensity`, `variant` | Spacing | Ignored on plain-text SMS; relevant for rich cards if added |

Email-specific: `motionOverlay`, `metadata.visual_density`, `metadata.target_image_slots`, Unlayer row JSON.

## Related

- [va4-phase-4.md](./va4-phase-4.md) — export polish, Outlook QA, licensing.
- [va3-phase-3.md](./va3-phase-3.md) — `layoutDensity`, split hero, resolve idempotency.
- [va2-phase-2.md](./va2-phase-2.md) — validation warnings, golden patterns.
