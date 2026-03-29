# VA2 Phase 10 — Rich visual_density: magazine-depth validation + strategist

## Goals

- **Baseline gaps [§20](./va2-pro-quality-baseline.md):** **Manifest depth (#1)** and **LLM variance / guardrails (#7)** — when **`metadata.visual_density`** is explicitly **`"rich"`**, promotional email should include **magazine-style** sections: at least one **non-hero** **`image_text`**, standalone **`image`**, or **`product_grid`**. **value_prop** grids alone (icons + copy) do not satisfy “rich” depth for this check; pair with **image_text** or **product_grid** waves.
- **Validation:** Non-blocking **`validateManifest`** warning (`pushRichVisualDensityWarnings` in [`designAssembler.ts`](../client/src/pages/marketing/lib/designAssembler.ts)) when `rich` is set without those section types — distinct from existing thin-layout warnings ([`pushThinPromotionalManifestWarnings`](../client/src/pages/marketing/lib/designAssembler.ts)).
- **Quality evidence:** `validateManifest` tests; strategist substring tests; referral starter updated so **`visual_density: rich`** remains valid under the new rule.

## Changelog (Phase 10)

| Date | Change |
|------|--------|
| 2026-03-28 | **Docs:** `va10-phase-10.md`; links from §24 baseline, README, product context, email pipeline. **Validation:** `pushRichVisualDensityWarnings` for `metadata.visual_density === "rich"` without `image_text` / `image` / `product_grid`. **Strategist:** Rich visual_density subsection (image_text + product_grid waves; alternating layouts). **Starters:** `referralLoyaltyProgramNudge.json` gains one **image_text** row so rich campaigns stay exemplar-clean. **Tests:** validateManifest + `contentStrategistPrompt` Phase 10; optional golden sanity for rich-compliant manifest. |

## Related phases

- **Phase 9:** [va9-phase-9.md](./va9-phase-9.md) — text_block density, partner + gift starters, subject warning.
- **Phase 4 (Outlook / export):** [va4-phase-4.md](./va4-phase-4.md) — export polish, Outlook QA.

## Principles (unchanged)

- No breaking change to `POST .../resolve-email-images` or public marketing routes unless explicitly scoped.
- Warnings are **non-blocking**; authors can still assemble — guidance only.

## Out of scope (defer)

Video heroes; server-side image re-encoding; hard errors on rich manifests.
