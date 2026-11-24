# MESSIGN — EMAIL DESIGN QUALITY TRACK (EQ) — MASTER PROMPT

> Paste in full at the start of EQ-00. Later sessions: *"Read `docs/roadmap/email-quality-track.md`, `docs/roadmap/weekly-progress.md` and the latest `eval/email-benchmark/runs/*/SCORES.md`, then run EQ-xx."*
> Facts as of 2026-11-24, `main` @ `3d15cee`. Status: approved by Hamza 2026-11-24 (placement, audience, benchmark). **v2 (same day):** EQ-05 banner compositor added after the reference analysis; later packages renumbered EQ-06…EQ-11.
> Companion files: `eval/email-benchmark/references.csv`, `docs/roadmap/email-quality-reference-analysis.md`.

## 1. MISSION

An e-commerce shop owner who is not a designer creates an offer at the shop counter. The email Messign builds for it should look like a senior email designer made it. It should match the shop's brand, use the shop's own product photos, give every image the right size, crop and quality for its place, and render correctly in Gmail, Outlook and Apple Mail.

**This is not a new studio.** It is a bounded quality sub-track of the marketing counter (`marketing-counter-120-day.md`). Keep Unlayer as the editor and HTML exporter. Do not build an editor. Do not add a wizard: the offer sheet already is one.

## 2. GROUND TRUTH (verified in code, do not re-ask)

**Pipeline today.** The server strategist (`server/src/modules/marketing/prompts/marketingContentStrategistPrompt.ts`, **1,537 lines**, `creative` model) writes a VA2 DesignManifest. The client then runs these steps:
- `manifestParser` → `validateManifest`
- `resolve-email-images` (`server/src/services/marketing/emailImageResolvePipeline.ts`)
- `mergeBrandIntoTheme`
- `blockBuilders/registry.ts`
- Unlayer JSON → `enforceAccessibility` + UTM

The vocabulary is small:
- 12 section types.
- The hero has about 3 variants (default / `split` / `editorial_tall`).
- 8 named themes (`executive`, `startup`, `luxury`, `minimal`, `bold`, `nature`, `tech`, `warm`).
- Brand overrides only primary, accent, background and text hex.
- 40 starters.

Thirteen "VA" phases (`docs/va2`…`va13`) mostly added starters, prompt rules and warnings.

**Never measured.** `docs/va2-pro-quality-baseline.md` defines a 100-point rubric. The sign-off checklist in `docs/va2-baseline-archive/README.md` is empty. There is no SCORES file, no captured samples and no rendered-output check.

**One draft.** There are no alternative concepts and no visual self-check (finding A1).

**Founder's complaint:** *"Images don't fit the page, aren't related to the topic, aren't designed, just put in order, and are low quality."* Code causes found so far:
- **Fit.** Images are generated at 1920×1080 (16:9) or 1024×1024, then displayed in slots of 800×450, 520×347 (3:2), 600×380 and 480×480. The generated aspect ratio doesn't match the slot, and no server-side crop or resize to the slot exists for email.
- **Relevance.**
  - A failed product image becomes one hard-coded Unsplash photo (`photo-1523275335684…&text=<keyword>`; Unsplash ignores `text`), so every failure shows the same unrelated picture.
  - Fallback prompts use generic padding such as "technology architecture nature product".
  - Product cards are *generated* from the LLM's `imagePrompt`, not taken from the shop's product photo.
  - `marketing_product_truth` has no image column. The Instagram flow has a reference-photo upload that email doesn't use.
- **Quality.** `FAL_EMAIL_IMAGE_MODEL` is unset by default and falls back to `fal-ai/flux/dev`. There is no relevance or artifact check after generation, and no weight budget per image.
- **"Just put in order".** Layout is a stack of generic sections with no colour-band rhythm, no composition recipes and no designed product presentation.

**Rules from other tracks that still bind:**
- No customer personal data in prompts or fixtures.
- CP-D7: the Fal prompt is a scene line, and price, claim, audience and dates stay out of the image.
- CP-D6: model choice for stills.
- `fal-model-change-runbook.md` before any Fal model change.
- WP-03 is done, so idempotent migrations are allowed.
- ADR-001: no frozen features.

**The repository is public.** Never commit third-party email screenshots, brand assets or keys.

## 3. SCOPE

**Email types (5):** offer / product drop · new release · occasion reminder · cart reminder · win-back.
**Benchmark tenants (3):** demo bookstore, demo florist, plus a **demo apparel/cosmetics shop** that exists only as a benchmark fixture, so the work does not overfit to two shops.

**Out of scope:**
- A new editor or drag-and-drop work.
- Brand extraction from a website URL.
- AMP, animated GIFs, invoices or receipts (except the cart summary card).
- Spam scoring.
- Buying Litmus or Email on Acid. Decide in EQ-11 from evidence.
- Dark mode beyond the basics in EQ-11.
- Localization beyond the brand language.
- Generated product images.
- The paper-plane overlay. Leave it as is and don't extend it.

## 4. BINDING PRINCIPLES

1. **Measure first, always.** Every session runs `npm run email:bench` before and after the change and records the delta in `weekly-progress.md`. A regression of more than 0.2 on any criterion blocks the merge unless the session report explains why.
2. **The library designs and the model chooses.** Quality comes from pre-designed sections and composition recipes. The model picks a recipe, fills copy and slot content, and writes scene lines. Code owns spacing, type scale, colour and image geometry. Don't fix design problems by making the prompt longer.
3. **Products are real.** A product image is the shop's own photo of that product. Never generate a book cover, a bouquet or a garment that's being sold. If there's no photo, use the section's designed no-image variant, which is a type-led card.
4. **Designed banners come from the compositor (EQ-05), not from Fal.** Text and prices are set by code from the offer sheet, never painted by an image model. **Generated imagery is only for mood.** Use it for hero backgrounds, scenes and textures. The prompt is the offer's scene line (CP-D7): no text in frame, and no faces unless the brand profile allows them.
5. **Every image is made for its slot:**
   - Generate at the slot's aspect ratio.
   - Crop server-side to the exact slot ratio, focus-aware where possible.
   - Output at 2× display width.
   - Use JPEG at about quality 80; PNG only for transparency. No WebP, because Outlook doesn't support it.
   - Keep each image at 200 KB or less.
   - Host it on our storage and write width and height into the Unlayer block.
6. **No silent fallbacks.** Never put a stock, Unsplash or placeholder image in an email. A failed image switches the section to its no-image variant, and the builder shows a one-line warning.
7. **Every image passes a check before use.** A cheap vision model checks that it matches the offer's category, has no text, watermark or obvious artifact, and follows the face rule. It gets one retry with a corrected prompt, then the no-image variant.
8. **Brand palette by role, not by theme name.** Base, surface, ink, accent and CTA are derived from the brand colours, contrast-safe (WCAG AA), with tints computed. Named themes are kept only as internal fallbacks.
9. **Email-safe by construction.** Every section must work in Outlook desktop (Word engine), stack at 375 px and keep the exported HTML under **102 KB**, the point where Gmail clips.
10. **Verify the render, not the JSON.** "Works" means the exported HTML was rendered to PNG and looked at, by the critic and by a person.

## 5. BENCHMARK (built in EQ-00, used by every session)

Layout:
```
eval/email-benchmark/
  briefs/            15 briefs = 3 tenants × 5 email types (offer sheet + product truth + brand profile, JSON)
  fixtures/photos/   product photos per tenant (generated once with a strong model, hand-approved by Hamza, committed; they stand in for tenant uploads)
  references/        git-ignored. ~30 real reference emails (PNG) + references.csv (url, brand, type, tags) committed
  critic/            critic prompt (email-critic@N), rubric, calibration ratings
  runs/<date>-<label>/  html/, png/desktop-600, png/mobile-375, lint.json, critic.json, SCORES.md
  compare.html       blind pairwise page: A vs B, random order, records Hamza's picks to picks.json
```

**Runner:** `npm run email:bench [--label x] [--briefs subset]` runs the real pipeline end to end, from the strategist through image resolve and assembly to Unlayer JSON, exported HTML and PNGs in headless Chromium.
- **Unlayer export:** check the available path first (headless embed with `loadDesign` → `exportHtml`, or Unlayer's export API on the current plan). If neither works with the keys in `.env`, stop and ask. Don't hand-roll an HTML exporter.
- **Lint (`emailLint`, deterministic).** Each check gives a hard or soft verdict:
  - aspect ratio within 2% of the slot
  - native width at least 2× display width (soft below 2×, hard below 1×)
  - each image 200 KB or less and total 800 KB or less
  - no placeholder, Unsplash or stock host
  - no duplicate image URL
  - AA contrast
  - alt text on every image
  - HTML under 102 KB
  - at least 3 distinct section types
  - at least one background-band change
  - no image-only sections carrying the core message
- **Critic (vision, frontier tier, temperature 0, versioned).** Scores 1–5 with one-line reasons on 8 criteria: layout and hierarchy · visual polish (spacing, alignment, consistency) · image fit · image relevance · image quality · brand fit · copy and CTA · mobile.
- **Calibration (EQ-00):** Hamza rates the 15 baseline renders on the same 8 criteria. The critic must be within ±1 of him on at least 80% of ratings, or the rubric is revised before the critic is used as a gate. Re-calibrate in EQ-06 and EQ-09.
- **References:** 30 real emails:
  - bookstore/publishing ×6
  - florist/gifting ×6
  - fashion, beauty and home D2C ×8
  - cart reminder ×4
  - win-back ×3
  - order or cart summary ×3

  Sources: Turkish brands from Hamza's inbox, plus public galleries such as Really Good Emails and Milled. Batch 1 (22 Turkish emails) is tagged in `references.csv` and analysed in `email-quality-reference-analysis.md`. Anchors: R18 Çiçeksepeti (florist), R19/R12 Silk and Cashmere (premium), R04 Starbucks (new release), R17 Yves Rocher (gift-guide structure), R02/R07 n11 (transactional), plus the "vivo" free-shipping email. Anti-patterns: R05 Şok, R08 Trendyol invoice, and the "Summer Sale" shoe grid. Still missing: bookstore, cart reminder, win-back. Screenshots and PDFs never go into git; redact personal data first.

## 6. SESSIONS

One package is one session. P0 packages are the track. P1 packages go first if capacity is tight.

| ID | Package | Done when (acceptance) | Pri |
|---|---|---|---|
| **EQ-00** | **Benchmark harness + baseline.** Briefs, fixture photos, runner, lint, critic, compare page, `SCORES.md`. Run the baseline on `main`. Write `eval/email-benchmark/FAILURES.md`: every baseline defect with a screenshot crop, tagged by root cause (fit / relevance / quality / layout / brand / copy / client). No product code changes. | 15 briefs render to desktop and mobile PNGs. Two consecutive runs on the same commit score within ±0.3 per criterion (use cached images for the repeat). Critic calibrated, or rubric revised. Baseline numbers recorded. | P0 |
| **EQ-01** | **Image fit.** Slot registry: each slot type has a display size, aspect ratio, max bytes and focal rule. Generate at the slot aspect. Server-side crop and resize with `sharp` to 2× display width, then JPEG and upload. Write width and height into the Unlayer image blocks. Delete the Unsplash and placeholder fallbacks. Add a designed no-image variant for hero, image_text and product cards, and a warning line in the builder. | Lint: 0 aspect, size or fallback failures on all 15 briefs. Critic "image fit" ≥ 4.0. Unit tests on crop math and the slot registry. A test asserts that no fallback host can appear in assembled JSON. | P0 |
| **EQ-02** | **Real product photos.** Add one idempotent migration: a product photo URL plus width and height on `marketing_product_truth`. Upload the photo in shop settings or the offer sheet by reusing the Instagram reference-photo upload path. Product sections use that photo, cropped per EQ-01. No photo means the no-image card. Generated images are limited to mood slots, prompted with the offer's scene line (CP-D7). | Product slots never call Fal. Critic "image relevance" ≥ 4.0. A test asserts that a product card with no photo renders the type-led variant and makes no Fal call. | P0 |
| **EQ-03** | **Image quality + check.** Pick the email model per CP-D6 (Pro or Ultra for heroes) using the runbook. Add the post-generation vision check (category match, no text or watermark or artifacts, face rule) with one retry, then the no-image variant. Add an optional background-removal cutout for product photos, which enables photos that overlap a colour band. Verify the current Fal model id before use. | Critic "image quality" ≥ 4.0. Rejected-image rate and cost per email recorded in AI telemetry. Blind pairwise against EQ-02 output: new preferred ≥ 70%. | P0 |
| **EQ-04** | **Brand palette roles + type pairs.** Derive base, surface, ink, accent and CTA from the brand colours and logo, with tints and AA-safe text colours. Six curated Google Font pairings chosen by brand personality. The strategist no longer picks a theme name. | Contrast lint 0 failures. Critic "brand fit" ≥ 4.0. Two tenants with different brand colours produce visibly different emails from the same recipe (pairwise check). | P0 |
| **EQ-05** | **Banner compositor.** Server-side HTML/CSS banner templates rendered in headless Chromium (reuse Playwright) to JPEG/PNG at 2× slot width. Inputs: palette roles, font pair (webfonts with Turkish glyphs), kicker/headline/price **from the offer sheet and truth only**, product photo or cutout, optional Fal mood background, decoration tokens (arch mask, ribbon, roundel, deadline chip, botanical accent). Templates v1: `big-number`, `band-hero`, `product-on-band`, `tier-header`. Every banner ships with a full-sentence `alt`, and its headline/CTA also exist as live HTML. Max 2 banners per email. See `email-quality-reference-analysis.md` §2. | Turkish glyphs render correctly (snapshot test with ı ş ğ ü ç İ). Price in a banner always equals the truth row (test). Images-off render still carries the offer and CTA (lint). Banner ≤ 200 KB. Blind pairwise: compositor hero vs EQ-04 hero, compositor preferred ≥ 70%. | P0 |
| **EQ-06** | **Section library v1 (about 10 sections).** Choose them from `FAILURES.md` and the references. Expected set (from `email-quality-reference-analysis.md` §3): discount block (live type) · product spotlight · tier header + 2-up product cards · category row (left/right) · benefit trio (thin-line accent icons) · editorial dark band with framed photos · ticker divider · segment button stack · status card + line items (cart summary) · sign-off band + footer with terms footnote. Each has desktop and mobile specs, an Outlook-safe build, and image and no-image variants. | Each section appears in a gallery fixture rendered at 600 and 375 px with 0 lint failures. Outlook-safe patterns documented per section. Snapshot tests. | P0 |
| **EQ-07** | **Composition recipes.** 2–3 recipes per email type (about 12 in total). Each recipe sets the section sequence, band rhythm, image slots and CTA placement. Recipes are data, not prompt text. | Critic "layout and hierarchy" ≥ 4.0. At least 2 different recipes are used across the 3 tenants for each email type. | P0 |
| **EQ-08** | **Strategist rewrite.** The prompt becomes: choose a recipe, fill slots and copy, write scene lines, with a strict schema. The old prompt stays behind a flag for one session of A/B, then is deleted. Target: under 300 lines. | Overall critic average ≥ 4.0. Blind pairwise new vs baseline: new preferred ≥ 80%. Parse failures 0 on the 15 briefs × 2 runs. | P0 |
| **EQ-09** | **Concepts + render-and-critique.** Generate 3 concepts (different recipe or palette emphasis), render them, have the critic rank them, and show the owner the top 2 to pick from. Show each concept's critic notes as one line, behind an (i). | Critic's top pick matches Hamza's pick ≥ 70% on 15 briefs. p50 time for 3 concepts ≤ 120 s. Cost per email recorded. | P1 |
| **EQ-10** | **Section-level edit in the builder.** Per section: Regenerate copy · Swap layout (same recipe slot) · Replace image (upload or regenerate mood). The rest of the email doesn't change. | Each action changes only its section (JSON diff test). Every control is wired end to end (UX principle 1). | P1 |
| **EQ-11** | **Client rendering + close-out.** Real sends of 5 benchmark emails through the Engage sandbox email account to allow-listed inboxes. Check Gmail web and app, Outlook desktop (Windows), new Outlook/web, and Apple Mail iOS. Basic dark mode: logo on transparent background, no invisible text. Final benchmark against the baseline and the references. Write a recommendation on whether a paid rendering service is needed. | No broken layout in any listed client. Track acceptance bar (§7) evidenced in `SCORES.md`. | P0 |

## 7. TRACK ACCEPTANCE BAR

- Critic average ≥ 4.0 / 5 across 15 briefs, and each of image fit, relevance and quality ≥ 4.0. Baseline recorded in EQ-00.
- Lint: 0 hard failures on all briefs.
- Blind pairwise, final vs baseline: final preferred ≥ 80%.
- Blind pairwise, ours vs references of the same email type: ours preferred or tied ≥ 40%. This is the proxy for "a senior designer made it".
- No stock or placeholder image possible in a shipped email (test-enforced). No generated product images (test-enforced).
- Client check passed (EQ-11). Generation time and cost per email recorded.

## 8. PLACEMENT

This track takes the **marketing evenings after MC-07**, because the journey email sits on the offer and that is the surface EQ improves:

MC-07 → EQ-00 … EQ-08 → MC-08 … MC-15 → EQ-09 … EQ-11 → MC-16 dogfood, which now exercises the new emails → MC-17.

Engage stays the default on other evenings.

## 9. HOW WE WORK

Same ritual as `docs/strategy/master-prompt.md` §12: one package per session. Each session runs:
1. Inspect.
2. Plan.
3. Run the benchmark before.
4. Implement.
5. Run the full tests.
6. Run the benchmark after.
7. Self-review the diff.
8. Update `weekly-progress.md`: done / remaining / next / benchmark delta.

Work on a branch and open a PR. Don't change send-gate code. Don't put customer data in fixtures or prompts. Before deleting a fallback or code path, confirm nothing else uses it.

## 10. EQ-00 CHAT SUMMARY (end of first session)

1. Baseline scores per criterion, the 3 best and 3 worst renders (with image paths).
2. Calibration result: critic vs Hamza agreement, and any rubric changes.
3. Top 10 defects from `FAILURES.md` by frequency × severity, each with its root-cause tag.
4. Confirmation or correction of the §2 causes (fit, relevance, quality, layout).
5. Any change to the EQ-01…EQ-08 order the baseline justifies.
6. Questions, only those that change scope.

## FINAL PRINCIPLE

The shop's real product, cropped for its place, in a layout a designer would have chosen, in the shop's colours, and proved by the render, not the JSON.
