# VA2 Pro Quality Baseline (Phase 1)

**Status:** Baseline pack for Lucy + Visual Architect v2 vs Unlayer gallery–level polish.  
**Audience:** Product, design, engineering.  
**Related:** [MESSIGN_PRODUCT_CONTEXT.md](./MESSIGN_PRODUCT_CONTEXT.md) (what Messign is), [email-design-pipeline.md](./email-design-pipeline.md), [.cursorrules](../.cursorrules), [reference-unlayer/README.md](./reference-unlayer/README.md).

---

## 0. Why this matters for Messign

Messign is an **AI-native omnichannel communication and design platform** — email is the primary **design surface** today, but the product thesis is **Layer 1 (design) + Layer 2 (delivery) + Layer 3 (intelligence) + analytics + learning** (see [MESSIGN_PRODUCT_CONTEXT.md](./MESSIGN_PRODUCT_CONTEXT.md)).

**Phase 1 implications:**

- **Pro template quality** in the Unlayer builder is not vanity; it is the **production standard** for customer-facing messages that must scale to more channels and reuse.
- **Rubric + client matrix** protect **brand trust** and **accessibility** before those patterns propagate to WhatsApp/SMS/RCS-style flows.
- **Gap analysis** prioritizes builder/prompt work **after** the bar is explicit, so engineering does not optimize the wrong “pretty.”

---

## 1. Phase 1 scope (exit criteria)

| Item | Description |
|------|-------------|
| **Goals** | Define measurable “pro template” quality; document non-negotiables; map gaps to code areas; prioritize industries for Phase 2. |
| **Non-goals** | No changes to `blockBuilders/*`, strategist prompts, or Unlayer embed behavior in Phase 1. |
| **Stakeholders** | Product (priorities), Design (rubric weights), Engineering (pipeline + feasibility), Marketing (verticals). |
| **Exit criteria** | (1) Weighted rubric agreed, (2) This document + archive README published, (3) Sign-off checklist completed ([va2-baseline-archive](./va2-baseline-archive/README.md)). |

---

## 2. Non-negotiable checklist (from `.cursorrules`)

| Constraint | Spec |
|------------|------|
| Round-trip | Unlayer design JSON: `loadDesign` → `exportHtml` → usable output |
| Colors | From design tokens in [`designTokens.ts`](../client/src/pages/marketing/lib/designTokens.ts); avoid ad hoc hex in builders |
| Fonts | Google Fonts only (Unlayer cannot load local fonts) |
| Layout width | ~600px content width (industry standard) |
| Responsiveness | Correct row/column configs; Unlayer stacks on mobile |
| Email clients | Gmail, Outlook 2019+, Apple Mail, Yahoo Mail, Outlook.com |
| Contrast | WCAG AA (4.5:1) for normal text on backgrounds |
| Preheader | Always include; substantive length; hidden visually in inbox pattern |
| Motion | Paper-plane overlay is progressive enhancement; see pipeline doc §11–12 |

---

## 3. Pipeline doc cross-walk (drift notes)

[`docs/email-design-pipeline.md`](./email-design-pipeline.md) matches these entry points:

| Documented module | Actual path | Notes |
|---------------------|-------------|--------|
| LLM → manifest | [`manifestParser.ts`](../client/src/pages/marketing/lib/manifestParser.ts) | Includes `parseManifestFromLLMOutput`, `synthesizeManifestFromPlainText`. |
| Validate + assemble | [`designAssembler.ts`](../client/src/pages/marketing/lib/designAssembler.ts) | `validateManifest`, `assembleDesign`, `runEmailAssemblyPipeline`. |
| Normalize sections | [`va2ManifestNormalize.ts`](../client/src/pages/marketing/lib/va2ManifestNormalize.ts) | Aliases for hero/CTA/image fields. |
| AI draft path | [`emailAiDraftToDesign.ts`](../client/src/pages/marketing/lib/emailAiDraftToDesign.ts) | Legacy bridge + VA2 orchestration. |
| Builders | [`blockBuilders/registry.ts`](../client/src/pages/marketing/lib/blockBuilders/registry.ts) | `getVa2Builder` per section type. |

**Drift / clarifications:**

- **Preheader length:** `.cursorrules` cites “100+ chars”; [`preheaderNormalize.ts`](../client/src/pages/marketing/lib/preheaderNormalize.ts) enforces `RECOMMENDED_PREHEADER_MIN_CHARS` (100) and max 200. Strategist copy may still target ~100–140 chars for marketing tone.
- **`blockBuilders.ts` barrel:** `.cursorrules` lists `blockBuilders.ts`; section logic lives under `blockBuilders/` + `registry.ts` — treat as the same concern.

---

## 4. “Pro template” dimensions

| Dimension | What “good” looks like |
|-----------|-------------------------|
| **Visual** | Clear hierarchy (hero → sections → CTA); alternating layouts; adequate whitespace; consistent radii/shadows from theme. |
| **Copy** | Subject + preheader complement; single primary CTA focus; scannable headings; no placeholder tone in shipped emails. |
| **Technical** | Valid HTML; reasonable total weight; images with alt text; links work; UTM when campaign metadata present. |
| **Brand** | Theme + optional `mergeBrandIntoTheme` overrides; logo row when configured. |
| **Accessibility** | WCAG AA text/background; buttons meet contrast; `enforceAccessibility` score tracked; fine print exempt from font-size warn where documented. |
| **Motion** | `motionOverlay` / `overlayIntensity` intentional; reduced-motion behavior understood. |

---

## 5. Weighted rubric (100 points) and thresholds

| Block | Points | Signals |
|-------|--------|---------|
| Visual hierarchy & layout | 25 | ≥3 distinct section types; hero + body rhythm; dividers/variants used intentionally; no wall of text. |
| Copy & CTA | 15 | Subject ≤80 chars; preheader 100–200 chars normalized; one primary CTA above fold or clearly sequenced. |
| Imagery | 15 | Slot count aligns with `metadata.target_image_slots` (default 6, max 12); distinct `imagePrompt`s; placeholders replaced in production. |
| Tokens & brand | 15 | Theme from `ThemeName`; no stray hex in manifest; brand overrides validated when present. |
| Accessibility | 15 | `accessibilityScore` from `runEmailAssemblyPipeline`; no unresolved high-severity contrast warnings; alt on images. |
| Technical / clients | 10 | Export loads in 5-client smoke; links resolve; preheader hidden in preview hack. |
| Mobile / narrow | 5 | Unlayer mobile preview: stacks; no horizontal scroll at ~320px. |

**Thresholds:**

- **Ship candidate:** ≥ 75 and no blocking a11y failures (contrast &lt; 4.5:1 on body copy).
- **Experimental / internal:** ≥ 60 or labeled “WIP”.

---

## 6. Rubric ↔ `enforceAccessibility` (automation map)

| Rubric area | Automated in [`accessibilityEnforcer.ts`](../client/src/pages/marketing/lib/accessibilityEnforcer.ts) | Manual |
|-------------|----------------------------------|--------|
| Text vs background contrast | Yes — extracts `color:` from text HTML vs column bg; skips hero-on-photo, preheader hidden | Hero art with busy photos |
| Button contrast | Yes — `buttonColors` / text vs fill | Ghost buttons on busy bg |
| Missing alt | Yes — sets default from options | Brand-specific alt quality |
| Font size | Warns if min &lt; 13px in visible blob | Legal line exceptions |
| Motion overlay | Informational warning for `_isOverlay` | — |

---

## 7. Rubric gaps ↔ code areas (Phase 2 hints)

| Gap type | Likely owner | Code / artifact |
|----------|--------------|-----------------|
| Weak section variety | Strategist prompt | [`marketingContentStrategistPrompt.ts`](../server/src/modules/marketing/prompts/marketingContentStrategistPrompt.ts) |
| Flat layout / spacing | Block builders | [`blockBuilders/`](../client/src/pages/marketing/lib/blockBuilders/) |
| Theme color bugs | Tokens | [`designTokens.ts`](../client/src/pages/marketing/lib/designTokens.ts) — avoid using `divider` for text (see warm theme). |
| Overlay / animation | Effects | [`specialEffects.ts`](../client/src/pages/marketing/lib/specialEffects.ts) |
| Image quality / count | API + enrichment | `POST .../resolve-email-images`, [`enrichManifestVisuals.ts`](../client/src/pages/marketing/lib/enrichManifestVisuals.ts) |
| Starter breadth | Product + dev | [`unlayerTemplates/registry.ts`](../client/src/pages/marketing/unlayerTemplates/registry.ts) |

---

## 8. External reference set (Unlayer gallery)

Use [Unlayer Templates](https://unlayer.com/templates) as the external benchmark. Record your own screenshots in the archive folder when validating.

| # | Category (site filter) | URL | Why it matters |
|---|------------------------|-----|----------------|
| 1 | Newsletter | https://unlayer.com/templates | Multi-section rhythm, digest layout. |
| 2 | Ecommerce | same | Product grids, promos, urgency blocks. |
| 3 | Marketing / Business | same | B2B hero + value props. |
| 4 | Food / Lifestyle | same | Warm imagery — compare to `warm` theme. |
| 5 | Technology | same | Clean grids — compare to `tech` / `startup`. |

**Process:** Pick 5–8 templates; export or screenshot; compare against Messign assembled HTML on the rubric (§5).

---

## 9. Internal reference set (Messign starters)

Sources: [`registry.ts`](../client/src/pages/marketing/unlayerTemplates/registry.ts).

| ID | Type | Asset |
|----|------|--------|
| email-simple | JSON | `starters/minimal.json` |
| email-conversion | JSON | `starters/emailConversionBase.json` |
| email-architect-layering | HTML import | `public/marketing/unlayer/templates/architect-layering-2026/blueprint.html` |
| email-product-launch | VA2 manifest | `starters/productLaunch.json` |
| email-weekly-newsletter | VA2 manifest | `starters/weeklyNewsletter.json` |
| email-flash-sale | VA2 manifest | `starters/flashSale.json` |
| email-rich-editorial | VA2 manifest | `starters/richEditorialEmail.json` |
| email-transactional-receipt | VA2 manifest | `starters/transactionalReceipt.json` |

**Full list:** See `getStarterTemplates('email')` — includes case study, seasonal, re-engagement, webinar replay, minimalist CTA, etc.

---

## 10. Comparison matrix (reference vs Messign)

| Criterion | Unlayer gallery (typical) | Messign VA2 (current baseline) |
|-----------|---------------------------|--------------------------------|
| Typography | Designer-tuned per template | Theme-bound Google Fonts + token sizes |
| Spacing | Per-template | `VA2_SPACING_SCALE` + section spacing |
| Imagery density | High in retail templates | Driven by slots + resolve pipeline |
| CTA placement | Multiple patterns | Hero + CTA sections + product cards |
| Section count | Often 6–12+ rows | Manifest-dependent; enrichment adds `image_text` rows |
| Polish | Hand-crafted | Improving via manifests + builders |

---

## 11. Theme inventory (`ThemeName`)

| Theme | Intent | Risk / note |
|-------|--------|-------------|
| executive | B2B, navy/blue | Low; neutral dividers. |
| startup | Tech launch, indigo | Accent tuned for WCAG on white (see token comment). |
| luxury | Premium, serif | Gold accent chosen for contrast on cream. |
| minimal | Default | Safest general-purpose. |
| bold | D2C, red energy | Strong accents; check button vs surface. |
| nature | Sustainability, green | Light green bg — verify text on `background`. |
| tech | Dev/AI, purple/mono | Dark text on light gray surfaces. |
| warm | Lifestyle, amber | `divider` is pale yellow — use for rules only; text uses `text`/`textMuted`. |

---

## 12. Baseline manifests (for regression scoring)

**Canned (tests / starters):**

1. `transactionalReceipt` — assembled in [`emailAssemblyWorkflow.test.ts`](../client/src/pages/marketing/lib/emailAssemblyWorkflow.test.ts) (`starter template manifests`).
2. Minimal hero + footer — same file (`runEmailAssemblyPipeline` sets `accessibilityScore`).
3. `productLaunch`, `flashSale`, or `richEditorialEmail` — import from `unlayerTemplates/starters/*.json`.

**Lucy / strategist-style:** Capture two real outputs from Content Strategist (email channel) in production or staging; store JSON under [`docs/va2-baseline-archive/`](./va2-baseline-archive/README.md).

**Exported HTML:** For each baseline, export from Unlayer after `loadDesign` and place in the archive for diffing across releases.

---

## 13. Example baseline scores (methodology)

- **Instrumentation:** `runEmailAssemblyPipeline(manifest, { skipUTM: true }).metadata.accessibilityScore` (number).
- **Tests:** [`emailAssemblyWorkflow.test.ts`](../client/src/pages/marketing/lib/emailAssemblyWorkflow.test.ts) asserts score is defined for assembled manifests.
- **Recorded samples:** Re-run when themes or `enforceAccessibility` changes; paste into archive `SCORES.md` (optional).

| Sample | Notes |
|--------|--------|
| Transactional receipt starter | Assembly success; score present (exact value varies with content). |
| Minimal hero + footer | Score present; few sections → fewer contrast surfaces. |

---

## 14. Client / inbox test matrix

| Client | Platform | Focus |
|--------|-----------|--------|
| Gmail | Web (Chrome) | Web fonts fallback; image proxy; link styling |
| Outlook | Windows desktop 2019+ or “new” Outlook | MSO conditional quirks; button padding |
| Outlook.com | Web | Simplified HTML path |
| Apple Mail | macOS + iOS | Font stack; width |
| Yahoo Mail | Web | Image blocking behavior |

**Known quirks:** Web fonts may fall back to system fonts (still acceptable if contrast OK). Outlook uses Word engine — test tables and full-width backgrounds.

---

## 15. 30-minute manual test protocol (per client)

1. Export HTML from builder (or use saved baseline HTML).
2. Open in client (send test email or paste in [Litmus](https://www.litmus.com)/[Email on Acid](https://www.emailonacid.com) if licensed).
3. **Images:** Load, alt visible in inspector, broken image handling.
4. **Links:** Primary CTA, footer links, unsubscribe merge tag if present.
5. **Preheader:** In inbox list, snippet matches expectation; hidden body preheader not visible in email body.
6. **Layout:** No horizontal scroll at desktop width; check mobile (see §16).
7. **Contrast:** Spot-check hero + body + footer text.

---

## 16. Mobile / ~320px

**Rubric (5 pts):** Columns stack; text does not overflow container; tap targets ≥44px where possible for primary CTA (email clients vary).

**Verification:** Unlayer mobile preview + one physical device spot-check per major release.

---

## 17. Image policy (VA2)

| Rule | Value |
|------|--------|
| Countable slots | Hero, `image`, `image_text`, `value_prop` items, `product_grid` items |
| Default target | `metadata.target_image_slots` default **6** when omitted (clamped **3–12**) |
| Max slots | **12** (`MAX_CAMPAIGN_IMAGE_SLOTS`) |
| Resolve | Server `POST /api/marketing/content/:id/resolve-email-images` (see server routes) |
| “Pro” feel | Distinct prompts per slot; avoid duplicate stock; watch total HTML weight |

---

## 18. Preheader policy

| Rule | Implementation |
|------|----------------|
| Min length | `normalizePreheaderForEmail` — [`RECOMMENDED_PREHEADER_MIN_CHARS`](../client/src/pages/marketing/lib/preheaderNormalize.ts) = 100 |
| Max length | 200 chars trimmed |
| Hidden snippet | Injected row with `display:none` / 1px font — skipped by `enforceAccessibility` for contrast |
| Copy | Should complement subject, not duplicate verbatim |

---

## 19. Round-trip protocol

1. Assemble design → `editor.loadDesign(design)`.
2. Optional: minor edit in Unlayer to verify blocks live.
3. `exportHtml()` — save output.
4. **Re-import:** Native JSON round-trip is the source of truth. HTML import depends on Unlayer embed version — may fail; prefer design JSON starters ([`registry.ts`](../client/src/pages/marketing/unlayerTemplates/registry.ts) comment).
5. Document failures under “known limitations” in release notes.

---

## 20. Top 10 gaps vs gallery-level pro (ranked)

1. **Manifest depth** — Strategist often under-uses `image_text` / `product_grid` vs gallery variety.
2. **Hero diversity** — Limited hero treatments vs designer templates (video, split, tall editorial).
3. **Typography scale** — Token-bound; fewer display treatments than hand-designed templates.
4. **Spacing rhythm** — Good defaults; less “magazine” variation than Unlayer showcases.
5. **Stock / gen imagery** — Depends on resolve pipeline and prompts; occasional generic scenes.
6. **Template library size** — Internal starters growing but smaller than public gallery breadth.
7. **LLM variance** — Same brief can yield different section orders/quality.
8. **HTML weight** — Many high-res images can bloat HTML; watch client limits.
9. **Third-party templates** — Legal/licensing if importing Unlayer gallery HTML wholesale.
10. **Edge clients** — Outlook quirks for complex backgrounds/overlays.

---

## 21. Phase 2 handoff (suggested tickets)

| Gap (# above) | Owner | Suggested ticket title |
|---------------|--------|------------------------|
| 1 | Prompt + validation | “Strategist: enforce minimum section mix for promotional email” |
| 2 | Builders | “Hero variants: tall editorial + split (token-safe)” |
| 3 | Tokens + builders | “Typography scale tokens per layoutDensity” |
| 4 | Builders | “Section variants (card/band/flush) audit across builders” |
| 5 | Image service | “Resolve pipeline: prompt quality + dedupe” |
| 6 | Product | “Expand `registry.ts` with 3 new manifest starters (ecommerce)” |
| 7 | Prompt + tests | “Golden manifest snapshots for strategist regression” |
| 8 | Product | “Image compression / lazy-load guidance in export” |
| 9 | Legal | “Template licensing policy for imports” |
| 10 | Builders + docs | “Outlook QA checklist for overlay rows” |

---

## 22. Industry priority (stakeholder decision)

**Recommended default order** for template + Lucy examples (confirm in sign-off):

1. D2C ecommerce / flash sale  
2. B2B SaaS / newsletter  
3. Events / webinar  
4. Onboarding / transactional (already strong in starters)

---

## 23. Risk register

| Risk | Mitigation |
|------|------------|
| Unlayer embed API changes | Pin `react-email-editor` version; test round-trip each upgrade |
| Large HTML / many images | Slot cap; image optimization policy |
| LLM manifest variance | Validation + enrichment + golden tests |
| Third-party template licensing | Use original Messign manifests or licensed assets only |
| WCAG false positives | `enforceAccessibility` heuristics — manual review hero photography |

---

## 24. Document control

- **Messign product context:** [MESSIGN_PRODUCT_CONTEXT.md](./MESSIGN_PRODUCT_CONTEXT.md)  
- **Canonical pipeline:** [email-design-pipeline.md](./email-design-pipeline.md)  
- **This baseline:** `docs/va2-pro-quality-baseline.md`  
- **Phase 2 implementation (pro parity):** [va2-phase-2.md](./va2-phase-2.md)  
- **Phase 3 implementation (density, resolve ops, export UX):** [va3-phase-3.md](./va3-phase-3.md)  
- **Phase 4 implementation (export polish, Outlook QA, licensing, starters):** [va4-phase-4.md](./va4-phase-4.md)  
- **Phase 5 implementation (gallery depth, builder parity, strategist tuning):** [va5-phase-5.md](./va5-phase-5.md)  
- **Phase 6 implementation (onboarding/transactional starters, typography/builder parity, short-preheader warning):** [va6-phase-6.md](./va6-phase-6.md)  
- **Phase 7 implementation (B2B nurture + D2C recovery starters, hero/strategist depth, testimonial/social_proof typography):** [va7-phase-7.md](./va7-phase-7.md)  
- **Phase 8 implementation (value_prop density typography, HTML weight guidance, release/referral starters, high-slot warning):** [va8-phase-8.md](./va8-phase-8.md)  
- **Phase 9 implementation (text_block density typography, partner + gift starters, subject-length warning, Outlook cross-link):** [va9-phase-9.md](./va9-phase-9.md)  
- **Phase 10 implementation (rich visual_density validation, strategist magazine-depth, referral starter image_text):** [va10-phase-10.md](./va10-phase-10.md)  
- **Phase 11 implementation (split + editorial_tall hero starters, hero builder scaled-type audit note, strategist hero guidance):** [va11-phase-11.md](./va11-phase-11.md)  
- **Phase 12 implementation (export/HTML weight + licensing hub, onboarding milestone + B2B customer-win starters):** [va12-phase-12.md](./va12-phase-12.md)  
- **Phase 13 implementation (Unlayer-gallery parity sprint: industry starters, strategist parity, thin-manifest depth, resolve duplicate prompts, Lucy UX):** [va13-phase-13.md](./va13-phase-13.md)  
- **Archive for HTML/JSON exports:** [va2-baseline-archive/README.md](./va2-baseline-archive/README.md)

---

## 25. Sign-off checklist

See [docs/va2-baseline-archive/README.md](./va2-baseline-archive/README.md) for the review meeting checklist and archive instructions.
