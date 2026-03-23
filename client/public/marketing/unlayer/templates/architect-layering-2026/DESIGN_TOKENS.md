# Messign — Architect Layering (Design tokens for Unlayer)

Use **600px** content width. Map **Row** = Unlayer row container; set **background-image** on the **row** (or outermost section), not on Image blocks.

## Environmental layer (u-row-container)

| Token | Value | Unlayer / CSS |
|-------|--------|----------------|
| Container BG color (fallback) | `#050505` | Body / row fallback |
| Environmental texture | High-res dark UI (grid/noise) | `background-image: url('…')` on **row container only** |
| BG size / position | `cover` / `center center` | Row → background size / position |
| u-row / u-col fill | **transparent** | Row background (when not the env row): `transparent`; Column: **no fill** or `transparent` |

## Asymmetric columns (exact ratios)

| Pattern | Left / Col A | Right / Col B | Use |
|---------|----------------|----------------|-----|
| A | **60.17%** | **39.83%** | Primary narrative \| Meta / AI status |
| B | **22.67%** | **77.33%** | Label / rail \| Long narrative |

In Unlayer: **Columns** → set widths to these **%** (not 50/50).

## Typography (“crushed” editorial)

| Role | Size | Line-height | Letter-spacing | Color |
|------|------|-------------|----------------|--------|
| Display / H1 | `49px` | **`100%`** (or `1`) — crushed | `-0.02em` to `-0.03em` | `#E4E4E7` |
| Body | `15px`–`16px` | **`160%`** | normal | `#E4E4E7` / `#A1A1AA` secondary |
| Meta / AI | `12px`–`13px` | `140%`–`150%` | `0.02em` | `#6B7280` (monospace font) |

## Dividers (“invisible”)

| Token | Value |
|-------|--------|
| Color | `#BBBBBB` **or** `#CCCCCC` (pick one per brand pass) |
| Weight | `1px` solid |
| Asymmetric padding (around divider row) | **`13px` `10px` `10px`** (top, L/R, bottom) |

## Glass cards (internal columns)

| Token | Value |
|-------|--------|
| Border | `1px solid rgba(255,255,255,0.1)` |
| Inner padding | `16px`–`20px` typical |
| Radius | `12px` (optional) |

## Primary CTA (Messign Ahead-of-Time)

| Token | Value |
|-------|--------|
| Fill | `#00F0FF` |
| Label | `#050505`, weight `800` |
| Radius | `8px` |

## Mobile (`max-width: 480px`)

| Rule | Value |
|------|--------|
| Scope | ID selectors + `!important` (see `blueprint.html`) |
| Buttons | **`width: 65%`** (or `max-width: 65%`), **`margin-left: auto`**, **`margin-right: auto`**, **center** text |
| Columns | Force full width + stack order via IDs |

---

**Unlayer sidebar checklist**

1. **Environment row:** Row → Background image = texture URL; repeat = no-repeat; size = cover.  
2. **Child rows:** Background = transparent.  
3. **Columns:** Width = 60.17% / 39.83% (or 22.67% / 77.33%); border = glass token; background transparent or very subtle `rgba(255,255,255,0.02)`.  
4. **Divider block:** Color `#CCC` or `#BBB`, height 1px; section padding `13px 10px 10px`.  
5. **Heading:** 49px, line-height 100% (if the editor allows), tight tracking.  
6. **Body text:** 16px, line-height 160%.

---

## Unlayer export parity (from `docs/reference-unlayer/*.zip`)

Unlayer’s compiled HTML uses **classes** and **pixel widths** at a **600px** row. Use the same names in the sidebar / custom HTML so mobile CSS can target blocks consistently.

| Class | Width @ 600px row | Pairing |
|-------|-------------------|---------|
| `u-row-container` | — | Wraps env background |
| `u-row` | `600px` | Inner grid |
| `u-col-60p17` | **361.02px** (~60.17%) | With `u-col-39p83` |
| `u-col-39p83` | **238.98px** (~39.83%) | Sums to **600** with 60p17 |
| `u-col-59p17` | **355.02px** (~59.17%) | With `u-col-40p83` (244.98px) — alternate split |
| `u-col-22p67` | **136.02px** (~22.67%) | With `u-col-77` |
| `u-col-77` | **462px** (~77%) | Reference pairs with 22p67 (≈598px total) |

**Content block IDs** (for `@media (max-width: 480px)` overrides, matching exports):

| ID | Purpose |
|----|---------|
| `u_content_heading_1` | 49px display; mobile `line-height: 100%` or `10%` (export uses both in different headings) |
| `u_content_divider_1` | Divider row; padding **`13px 10px 10px`** |
| `u_content_button_1` | Wrap CTA; inner `.v-size-width` → **`width: 65%`** on small screens |

Helper classes on headings / buttons: `v-font-size`, `v-line-height`, `v-text-align`, `v-size-width`, `v-container-padding-padding`.

---

## See also

- [`ARCHITECT_MASTER_PROMPT.md`](./ARCHITECT_MASTER_PROMPT.md) — Cursor master prompt (role + AOT rules + workflow).
- [`UNLAYER_STYLES.md`](./UNLAYER_STYLES.md) — Unlayer sidebar values and block mapping.
