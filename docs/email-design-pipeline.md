# Email design pipeline (Visual Architect v2)

How **DesignManifest JSON** becomes **Unlayer design JSON** in the Marketing email builder, and how that differs from the legacy path.

Broader Marketing architecture: [marketing-v2-architecture.md](./marketing-v2-architecture.md).

## Entry points (client)

| Step | Primary module |
|------|----------------|
| LLM output → manifest | `client/src/pages/marketing/lib/manifestParser.ts` |
| Validate + normalize VA2 | `validateManifest` in `client/src/pages/marketing/lib/designAssembler.ts` |
| Section content aliases | `client/src/pages/marketing/lib/va2ManifestNormalize.ts` |
| Manifest → rows | `assembleDesign` in `designAssembler.ts` |
| Full product path (a11y + UTM) | `runEmailAssemblyPipeline` / `assembleDesignFull` in `designAssembler.ts` |
| AI draft / conversion | `client/src/pages/marketing/lib/emailAiDraftToDesign.ts` |
| Tokens + brand merge | `client/src/pages/marketing/lib/designTokens.ts` (`mergeBrandIntoTheme`) |
| Section builders | `client/src/pages/marketing/lib/blockBuilders/registry.ts` (`getVa2Builder`) |

**Layout density (`layoutDensity`)** — normalized in `validateManifest` and threaded into block builders for typography and section padding — is documented in [va3-phase-3.md](./va3-phase-3.md) (vs `metadata.visual_density`, which gates image-slot enrichment). Phase 2 typography notes: [va2-phase-2.md](./va2-phase-2.md#layout-density-and-typography).

**Export size, hosted images, Outlook overlay QA, and template licensing** for the email builder are summarized in [va4-phase-4.md](./va4-phase-4.md) (Phase 4).

**Builder parity across section types, strategist depth for D2C/events, duplicate image-prompt warnings, and omnichannel field notes** are covered in [va5-phase-5.md](./va5-phase-5.md) (Phase 5).

**Onboarding / transactional template depth, image & CTA density parity, and short-preheader validation** are summarized in [va6-phase-6.md](./va6-phase-6.md) (Phase 6).

**B2B nurture + D2C recovery starters, hero-diversity strategist rules, and testimonial / social_proof typography scaling** are summarized in [va7-phase-7.md](./va7-phase-7.md) (Phase 7).

**Value prop density typography, HTML weight / high image-slot warnings, and release/referral starters** are summarized in [va8-phase-8.md](./va8-phase-8.md) (Phase 8).

**Text block density typography, partner + gift starters, subject-length validation warning, and Outlook / Phase 4 cross-link** are summarized in [va9-phase-9.md](./va9-phase-9.md) (Phase 9).

**Rich `visual_density` magazine-depth (image_text / image / product_grid), strategist guidance, and validateManifest warning** are summarized in [va10-phase-10.md](./va10-phase-10.md) (Phase 10).

**Split vs editorial_tall hero exemplars, registry starters, and strategist hero layout guidance** are summarized in [va11-phase-11.md](./va11-phase-11.md) (Phase 11).

**Export/HTML weight hub, licensing pointer, onboarding + customer-win starters** are summarized in [va12-phase-12.md](./va12-phase-12.md) (Phase 12).

**Industry starters (real estate, nonprofit, food, music), Unlayer-category strategist parity, thin promotional manifest depth, duplicate image-prompt warnings on resolve, Lucy quick actions, and wizard template mapping** are summarized in [va13-phase-13.md](./va13-phase-13.md) (Phase 13).

### Unlayer parity checklist (manual QA)

- **Mobile:** Unlayer mobile preview (~320px): columns stack; no horizontal scroll; tap targets reasonable on primary CTA.
- **Clients:** Export HTML smoke in Gmail and Outlook desktop; complex hero backgrounds follow [va4-phase-4.md](./va4-phase-4.md) (Outlook QA).
- **Copy:** Subject and preheader complement; one primary CTA story where appropriate.
- **Imagery:** Distinct `imagePrompt` per slot; watch estimated HTML weight in the builder pipeline strip ([va12-phase-12.md](./va12-phase-12.md), baseline §20).

## 1. Two assembly paths: VA2 (primary) vs legacy flat

- **VA2** (`version: '2.0'`, ordered `sections`, theme names like `minimal`, `executive`) is the primary contract.
- **Legacy flat** manifests (`colorTheme`, `layout`, `meta`) are bridged with `legacyFlatManifestToVa2` (`client/src/pages/marketing/lib/legacyFlatToVa2.ts`) and then run through the same VA2 pipeline.
- **`assembleLegacyDesign`** is deprecated for new work; it renders old flat JSON without the bridge and uses `legacyBuilders` + `ResolvedAssets`.

## 2. `runEmailAssemblyPipeline` is the full product path

`assembleDesign` produces Unlayer rows. **`runEmailAssemblyPipeline`** calls **`assembleDesignFull`**, which:

- Optionally derives **UTM** from `metadata.campaign_id` (`utmParamsFromManifestMetadata`).
- Runs **`enforceAccessibility`** on the assembled design and sets **`metadata.accessibilityScore`**.
- Optionally **`injectUTMParameters`** into link hrefs.

Use this path from the email builder so behavior matches diagnostics and campaign tracking.

## 3. Registry-driven section builders

`blockBuilders/registry.ts` maps each **`SectionType`** to a **block builder** `(content, theme, options) => rows`. Unknown types are **skipped** and recorded in **`AssemblyResult.skippedSections`**, not thrown.

## 4. Validation normalizes before assembly

`validateManifest`:

- Enforces **subject**, non-empty **sections**, and **unique `order`** per section.
- Normalizes **preheader** length via `normalizePreheaderForEmail` (`preheaderNormalize.ts`).
- Applies **`normalizeVa2SectionContent`** per section (CTA aliases, hero nested `cta`, `imageAlt` → `altText`).
- Emits **non-blocking warnings** for short preheader (when not minimal), **long subject** (above ~55 chars, mobile truncation), high **`target_image_slots`**, thin promotional layout, **`metadata.visual_density: rich`** without **image_text** / **image** / **product_grid**, and duplicate **`imagePrompt`** strings — see [va9-phase-9.md](./va9-phase-9.md) (subject) and [va10-phase-10.md](./va10-phase-10.md) (rich density).

## 5. Automatic structural glue: preheader, footer, brand logo

During **`assembleDesign`**:

- If there is no **`preheader`** section, a preheader row is **auto-injected** from `manifest.preheader` / subject (no warning — omitting the section is normal).
- If there is no **`footer`** section, a default footer is injected using **`footerDefaults`** when provided (no routine warning).
- If **`brandOverrides.logoUrl`** is set, a **brand logo row** is inserted after the preheader block (warning on failure).

## 6. Brand as theme overrides

**`BrandThemeOverrides`** (primary/accent/body background/text hex, optional logo URL/alt) are merged with **`getTheme(manifest.theme)`** via **`mergeBrandIntoTheme`**. Builders consume the resulting **`DesignTheme`** so colors stay token-driven.

## 7. Section order and spacing

- Sections are sorted by **`order`**; **`sectionStartRowMap`** tracks row indices for **overlay** effects (`specialEffects.ts`, e.g. paper plane).
- Default **spacing** adds **`paddingTop: 'md'`** after the first rendered section when the section is not `preheader`, unless the manifest specifies spacing.

## 8. Images resolved upstream

**`resolveAssetsForVa2Manifest`** / **`mergeResolvedAssetsIntoVa2Manifest`** attach **`imageUrl`** values before assembly. **`assembleDesign`** does not generate images; it consumes the manifest as prepared.

## 9. Post-assembly: accessibility and links

- **`enforceAccessibility`** operates on the **Unlayer design JSON** (contrast, links, etc.), not only manifest fields.
- **UTM injection** is a separate pass on the design’s links when `utmParams` are present.

## 10. AI draft → design pipeline

**`emailAiDraftToDesign`** (and related helpers) orchestrates: parse JSON → **validate VA2** or **bridge legacy** → resolve images → apply **brand** extraction → **`runEmailAssemblyPipeline`**. The same manifest shape should align with the **Content Strategist** output on the server (`server` marketing prompts / agents).

## 11. Motion overlay (paper plane) — manifest v2

- **Preferred fields:** `motionOverlay`: `"off"` | `"paper_plane_sweep"`, and optional `overlayIntensity`: `"signature"` | `"subtle"` (weave-style, lighter motion for transactional layouts).
- **Legacy:** `easterEgg`: `"paper_plane"` is still accepted; `validateManifest` maps it to `motionOverlay: "paper_plane_sweep"` and mirrors `easterEgg` for older tooling.
- **Assembly:** `assembleDesign` calls `buildMultiPhaseOverlay` with **`sectionStartRowMap`** and **assembled row count** to estimate sweep height (`estimateEmailHeightForOverlay` in `specialEffects.ts`). Optional **`brandOverrides.primaryHex`** flows to **`getPlaneAssetUrl`** and server overlay generation for brand-harmonized AI planes.
- **Accessibility:** `enforceAccessibility` adds an informational warning when `_isOverlay` rows exist. Exported HTML includes **`@media (prefers-reduced-motion: reduce)`** with a **static** plane; mobile preview still hides the overlay row (`hideMobile` on the phantom row).

## 12. Client compatibility (paper plane overlay)

| Concern | Behavior |
|--------|----------|
| **`:has()`** | Used to force `overflow: visible` on ancestors. Clients without `:has()` may clip the plane; a **`@supports not(selector(:has(*)))`** fallback sets overflow on cells inside the overlay block. |
| **Outlook (MSO)** | Animated block is wrapped in **`<!--[if !mso]><!-->`** so Word-based Outlook skips the decorative layer. |
| **Mobile** | Overlay row uses **`hideMobile: true`** in Unlayer — narrow previews hide motion. |
| **Gmail / webmail** | CSS animation support varies; treat motion as **progressive enhancement**. |

## 13. Product telemetry (client)

**`trackVa2EmailTelemetry`** (`client/src/pages/marketing/lib/emailMarketingTelemetry.ts`) dispatches a **`messign:va2-email`** `CustomEvent` on `window` with events such as `email_theme_switch` and `email_motion_overlay_toggle` (theme, effect, surface). Host apps can subscribe for analytics without coupling the marketing module to a specific vendor.

## Related tests

- `client/src/pages/marketing/lib/emailAssemblyWorkflow.test.ts` — validation, assembly, brand merge, inbox copy helpers.
- `client/src/__tests__/pages/marketing/lib/specialEffects.test.ts`, `motionOverlayManifest.test.ts` — overlay HTML and manifest resolution.

## Related documents

- **[Messign product context](./MESSIGN_PRODUCT_CONTEXT.md)** — what Messign is (design + delivery + intelligence + analytics); how VA2 fits Layer 1.
- **[VA2 Pro Quality Baseline (Phase 1)](./va2-pro-quality-baseline.md)** — rubric, client matrix, theme inventory, gap analysis vs Unlayer gallery–level polish, Phase 2 handoff.
- **[Baseline archive](./va2-baseline-archive/README.md)** — optional HTML/JSON exports and sign-off checklist.
