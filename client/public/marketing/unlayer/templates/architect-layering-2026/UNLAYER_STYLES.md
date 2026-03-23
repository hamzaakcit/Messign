# Messign “Architect Layering” — Unlayer sidebar values

**Brand:** Messign Workspace. **Vibe:** 2026 tech journalism / dashboard OS — environmental background, glass columns, asymmetric grid, crushed display type.

**Grid:** Ship **600px** content width. Map **Row** = Unlayer row container; set **background-image** on the **outer environment row** (or body), **not** as a hero Image block for the texture layer.

Full token tables: [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md).

## Color tokens

| Role | Hex | Unlayer usage |
|------|-----|----------------|
| Deep base (fallback) | `#050505` | Body / row fallback when image fails |
| Body / display text | `#E4E4E7` | Headings, primary paragraphs |
| Secondary body | `#A1A1AA` | Subline, de-emphasized copy |
| Meta / AI | `#6B7280` | Monospace labels (`ui-monospace`, Menlo, etc.) |
| Primary CTA | `#00F0FF` fill, `#050505` label | Button |
| Divider | `#BBBBBB` or `#CCCCCC` | Divider block, 1px (pick one per brand pass) |
| Glass border | `rgba(255,255,255,0.1)` | 1px on columns (“cards” over the background) |

## Global / Body

| Property | Value |
|----------|--------|
| Background | `#050505` (fallback under environmental image) |
| Content width | `600px` |
| Default font | `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Helvetica`, `Arial`, sans-serif |
| Link color | `#00F0FF` (sparingly) |

## Environmental layer (u-row-container)

| Property | Value |
|----------|--------|
| Row background image | High-res dark UI / texture URL |
| Repeat | `no-repeat` |
| Size | `cover` |
| Position | `center center` |
| Child rows | **Transparent** — no solid fill blocking the texture |
| Columns | **Transparent** (or imperceptible `rgba(255,255,255,0.02)`) |

## Hero / lead (single column)

| Block | Property | Value |
|-------|-----------|--------|
| Meta line | Font | Monospace stack |
| Meta | Size | `12px`–`13px`, letter-spacing `0.06em`, uppercase |
| Meta | Color | `#6B7280` |
| Display H1 | Size | `49px` |
| Display H1 | Weight | `800` |
| Display H1 | Line height | **`100%`** (crushed) — not `10%` for real copy |
| Display H1 | Letter spacing | `-0.02em` to `-0.03em` |
| Display H1 | Color | `#E4E4E7` |
| Body | Size | `15px`–`16px` |
| Body | Line height | **`160%`** |
| Body | Color | `#E4E4E7` or `#A1A1AA` |
| Button | Background | `#00F0FF` |
| Button | Text | `#050505`, **bold** |
| Button | Radius | `8px` |
| Button | Inner padding | `14px` `28px` |

**Section padding (hero):** e.g. `48px` `32px` `32px` `32px` — align with [`blueprint.mjml`](./blueprint.mjml).

## Asymmetric columns (exact ratios)

Do **not** use 50/50 for these patterns.

| Pattern | Column A | Column B | Use |
|---------|-----------|-----------|-----|
| A | **60.17%** | **39.83%** | Primary narrative \| Meta / AI status |
| B | **22.67%** | **77.33%** | Rail / label \| Long narrative |

In Unlayer: **Columns** → set widths to these **%** (see pixel widths @ 600px in [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md)).

| Glass card | Value |
|------------|--------|
| Border | `1px solid rgba(255,255,255,0.1)` |
| Radius | `12px` (optional) |
| Inner padding | `16px`–`20px` |

## Dividers (“invisible”)

| Property | Value |
|----------|--------|
| Color | `#BBBBBB` **or** `#CCCCCC` |
| Weight | `1px` |
| Section padding around divider | **`13px` `10px` `10px`** (top, L/R, bottom) |

## Mobile (`max-width: 480px`)

Unlayer exports use `#u_content_*` IDs. For pixel parity, merge rules from [`blueprint.html`](./blueprint.html):

| Rule | Value |
|------|--------|
| Display heading | Scale down (e.g. `36px`), center if desired |
| Button wrapper | **`width` / `max-width: 65%`**, **`margin-left/right: auto`**, **center** text |
| Divider block | Padding **`13px` `10px` `10px`** on container |

## Import paths

- **MJML:** [`blueprint.mjml`](./blueprint.mjml) — compile to HTML, then paste or import.
- **HTML:** [`blueprint.html`](./blueprint.html) — reference, HTML block, or app **HTML import** starter.
- **Cursor prompt:** [`ARCHITECT_MASTER_PROMPT.md`](./ARCHITECT_MASTER_PROMPT.md) — copy-paste rules for AI-assisted edits.

## Unlayer block mapping

| Region | Blocks |
|--------|--------|
| Environment | **Section/Row** → background image on **container** row; inner sections **transparent** |
| Lead | **Text** (meta), **Heading** (49px / 100% LH), **Text** (body 160%), **Button** |
| Dividers | **Divider** (`#CCC` or `#BBB`, 1px); section padding **13px 10px 10px** |
| Asymmetric | **Section** → **2 Columns** with widths **60.17 / 39.83** or **22.67 / 77.33**; **Text** in each; glass = column border + transparent fill |
| Footer | **Text** (muted, links) |

**Images:** For Architect Layering, do **not** rely on a full-bleed hero **Image** block for the texture — use **`background-image` on the row** (see [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md) checklist).
