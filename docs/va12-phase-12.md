# VA2 Phase 12 — Export/HTML weight hub, licensing pointer, onboarding + customer-win starters

## Goals

- **Baseline gaps [§20](./va2-pro-quality-baseline.md):** **Template library (#6)**, **HTML weight (#8)**, **Third-party licensing (#9)** — single **Phase 12 doc hub** for slot budget, estimated HTML weight ([`estimateUnlayerDesignHtmlWeight`](../client/src/pages/marketing/lib/estimateUnlayerDesignHtmlWeight.ts)), and **licensing** (align with [va4-phase-4.md](./va4-phase-4.md) third-party / Unlayer gallery policy). **Strategist** reinforces export discipline and **original or licensed** assets.
- **Starters:** Two new manifests — **onboarding milestone / progress** depth and **B2B customer win / case** narrative — registered in [`registry.ts`](../client/src/pages/marketing/unlayerTemplates/registry.ts); **`LIST_VERSION` 17**.

## Changelog (Phase 12)

| Date | Change |
|------|--------|
| 2026-03-28 | **Docs:** `va12-phase-12.md`; cross-links. **Starters:** `onboardingProgressMilestone.json`, `b2bCustomerWinStory.json`. **Strategist:** export/HTML discipline + licensing one-liner. **Tests:** golden + `contentStrategistPrompt` Phase 12. |

## HTML weight and slot budget (summary)

- **`metadata.target_image_slots`** is clamped **3–12** ([`emailManifestImageSlots`](../client/src/pages/marketing/lib/emailManifestImageSlots.ts)); high counts increase resolve time and **exported HTML** size.
- Prefer **HTTPS** asset URLs after resolve over huge inline payloads — see [va4-phase-4.md](./va4-phase-4.md) export policy and [va8-phase-8.md](./va8-phase-8.md) strategist HTML-weight notes.
- Builder **heuristic** KB: [`estimateUnlayerDesignHtmlWeight`](../client/src/pages/marketing/lib/estimateUnlayerDesignHtmlWeight.ts).

## Licensing (summary)

- Do not redistribute **Unlayer public gallery** or third-party HTML as Messign product templates without **rights**. Use **original** Messign manifests or **licensed** exports you own — full policy in [va4-phase-4.md](./va4-phase-4.md).

## Related phases

- **Phase 11:** [va11-phase-11.md](./va11-phase-11.md)
- **Phase 8:** [va8-phase-8.md](./va8-phase-8.md) — HTML weight / high-slot warning

## Out of scope (defer)

Server-side image re-encoding; legal review beyond engineering notes.
