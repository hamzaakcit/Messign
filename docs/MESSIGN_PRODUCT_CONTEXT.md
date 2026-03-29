# Messign — product context (engineering reference)

**Purpose:** Single place to align on what Messign is, so feature work (email/VA2, chat, campaigns, analytics) is not scoped as “just another email builder.” Update this doc when positioning shifts; link from specs and Phase plans.

---

## One-line definitions

- **Short:** Messign is an **AI-native omnichannel communication and design platform** — create, optimize, and send customer messages across channels from one place.
- **Strategic:** Messign aims to be the **messaging brain** of a modern business: design, delivery, intelligence, and learning in one system—not a siloed newsletter tool.

---

## The four questions Messign helps answer

1. **What should we say?** (copy, offers, tone, compliance)
2. **How should it look?** (templates, brand, responsive layouts)
3. **Which channel should we use?** (email, WhatsApp, SMS, RCS, …)
4. **What worked, and what should we improve next?** (analytics, tests, optimization)

Engineering implication: features should **compose** toward these four—not optimize only one in isolation.

---

## Product layers (mental model)

| Layer | Role | Examples in the product direction |
|-------|------|-----------------------------------|
| **1 — Design** | Visual production: templates, blocks, branding, responsive layouts | Unlayer email builder, VA2 manifests, reusable starters, Lucy-assisted layouts |
| **2 — Delivery** | Send across channels | Email today; WhatsApp, SMS, RCS and similar as the platform expands |
| **3 — Intelligence** | AI + rules to improve messages | Dora, Content Strategist, channel recommendations, copy variants |
| **4 — Analytics** | Measure outcomes | Opens, clicks, conversions, delivery, channel/segment performance |
| **5 — Learning** | Close the loop | A/B tests, calibration from past campaigns, optimization suggestions |

VA2 / Lucy / Unlayer sit primarily in **Layer 1**, but manifests, tokens, and quality bars should stay **channel-agnostic where possible** (brand, structure, accessibility) so assets and patterns can extend to other surfaces later.

---

## What Messign is not

- Not only an email newsletter sender.
- Not only a drag-and-drop file; it is intended as **workflow + intelligence** on top of design and delivery.
- Not “developers must hand-code every variant” — strong editors and modular systems reduce that dependency.

---

## Target customers (typical)

Companies that communicate at scale: ecommerce, SaaS, fintech, marketplaces, agencies, lifecycle marketing, operations, customer success, and eventually enterprise messaging volume.

**Shared need:** the right message, to the right person, on the right channel, at the right time.

---

## Problems Messign is built to reduce

| Problem | Direction |
|---------|-----------|
| **Fragmentation** | Many tools for email, SMS, chat, analytics — Messign unifies the workflow narrative. |
| **Developer bottleneck** | Visual builders + templates + AI reduce “every change needs an engineer.” |
| **Weak personalization** | AI-assisted segmentation and dynamic content. |
| **Poor channel fit** | Help choose channel per use case, not blast the same asset everywhere. |
| **No learning loop** | Analytics + tests + recommendations close the loop. |

---

## Strategic positioning

Messign sits at the intersection of:

1. **Communication infrastructure** — businesses must message customers constantly.
2. **Creative production** — messages must look on-brand and render everywhere.
3. **Decision intelligence** — teams need help choosing what works.

That combination supports retention, expansion, and a data advantage over time.

---

## Relation to this repository

- The **Marketing / VA2** workstream is a **first-class instance of Layer 1** (design) with **Layer 3** (Lucy / agents) attached.
- **Phase 1 quality baselines** ([va2-pro-quality-baseline.md](./va2-pro-quality-baseline.md)) define “pro” email output so Messign’s **design layer** matches the ambition of the full platform—not a disposable HTML generator.

### VA2 manifest fields: email-specific vs cross-channel

| Reusable later (SMS / WhatsApp / push) | Primarily email / Unlayer today |
|----------------------------------------|-----------------------------------|
| `subject`, `preheader` (can map to push title/body) | `layoutDensity`, section `variant`, Unlayer row shapes |
| `theme`, `sections[]` narrative structure, `metadata.tone`, `metadata.audience` | `motionOverlay`, `metadata.visual_density` / `target_image_slots` (email builder enrichment) |
| `artDirection`, CTA copy URLs | `metadata.email_resolve` (server image pipeline) |

See [va3-phase-3.md](./va3-phase-3.md) for Phase 3 wiring details.

**Phase 4 (Layer 1 polish):** export/HTML weight awareness, Outlook-friendly overlay checks, licensing notes for imports, and B2B/D2C starter depth — [va4-phase-4.md](./va4-phase-4.md).

**Phase 5 (Layer 1 depth):** remaining block builders (`product_grid`, `value_prop`, `text_block`, `divider`) aligned with `layoutDensity` / section variants; duplicate-`imagePrompt` validation warnings; strategist guidance for D2C product-grid waves and events/webinar flows; omnichannel field notes — [va5-phase-5.md](./va5-phase-5.md).

**Phase 6 (Layer 1 breadth):** onboarding welcome-series and transactional/minimal `visual_density` patterns in the strategist; deep onboarding + compact transactional starters; `image` / `cta` builder parity with `layoutDensity` / variants; optional short-`preheader` warning when not minimal — [va6-phase-6.md](./va6-phase-6.md).

**Phase 7 (Layer 1 verticals):** B2B thought-leadership nurture and D2C abandoned-cart recovery starters; strategist guidance for **hero layout diversity**, **browse/cart recovery** copy, and **`metadata.campaign_id` / UTM-aware CTAs**; density-scaled typography in **testimonial** and **social_proof** — [va7-phase-7.md](./va7-phase-7.md).

**Phase 8 (Layer 1 polish + breadth):** **`value_prop`** per-item typography scaled with `layoutDensity`; **HTML weight** / image-slot budget in strategist; **SaaS release/changelog** and **referral/loyalty** starters; optional **`target_image_slots` ≥ 11** validation warning — [va8-phase-8.md](./va8-phase-8.md).

**Phase 9 (Text block + vertical breadth):** **`text_block`** body uses **`scaledBodyFontSize`**; **partner co-marketing / joint webinar** and **D2C seasonal gift guide** starters; **subject** length soft warning (mobile truncation); strategist **Outlook** QA pointer to Phase 4 — [va9-phase-9.md](./va9-phase-9.md).

**Phase 10 (Rich density guardrails):** **`metadata.visual_density: rich`** requires at least one non-hero **`image_text`**, **`image`**, or **`product_grid`**; **`validateManifest`** warns otherwise; strategist **magazine-depth** notes; **referral** starter includes **image_text** for exemplar compliance — [va10-phase-10.md](./va10-phase-10.md).

**Phase 11 (Hero diversity):** **Split** and **editorial_tall** hero exemplar starters; **`heroBuilder`** documents density-scaled headline/subhead/CTA; strategist **when to use** split vs tall vs default — [va11-phase-11.md](./va11-phase-11.md).

**Phase 12 (Export + breadth):** **HTML weight / slot budget / licensing** hub; **onboarding milestone** and **B2B customer win** starters; strategist **export discipline + licensing** — [va12-phase-12.md](./va12-phase-12.md).

**Phase 13 (Unlayer-gallery parity):** **Real estate, nonprofit, food, music** starters; **strategist** industry facets; **validateManifest** depth when hero present; **resolve** `promptDuplicateWarnings`; **Lucy** quick actions + wizard goals; **export** weight tiers — [va13-phase-13.md](./va13-phase-13.md).

---

## Document control

- **Canonical product narrative for engineering:** this file.
- **Email pipeline mechanics:** [email-design-pipeline.md](./email-design-pipeline.md)
- **VA2 quality bar / Unlayer parity:** [va2-pro-quality-baseline.md](./va2-pro-quality-baseline.md)
