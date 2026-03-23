# Messign “2026 AI-Native” — Unlayer sidebar values

**Brand:** Messign Workspace (AI-native business OS). **Vibe:** High-end dashboard (Linear / Vercel / OpenAI), not generic blue-and-white.

**Grid:** Design at **1200px** logic, ship **600px** content width in email (scale typography/spacing proportionally).

## Color tokens

| Role | Hex | Unlayer usage |
|------|-----|----------------|
| Deep base (BG) | `#050505` | Body background |
| Surface (cards) | `#121214` | Column backgrounds (Bento boxes) |
| Primary action | `#00F0FF` | Buttons; bold label `#050505` |
| Accent glow (AI) | `#7000FF` | Optional HTML block: `box-shadow`, borders (subtle) |
| Body text | `#E4E4E7` | Paragraph / default text |
| Monospace / status | `#6B7280` | “AI / system” labels (`Courier New`, `ui-monospace`, SF Mono) |
| Divider | `#1F1F23` | Divider block (1px) |
| Social icons | `#9CA3AF` | Tint monochrome assets or link color |
| Card border | `rgba(255,255,255,0.1)` | 1px on Bento columns or HTML wrapper |

## Global / Body

| Property | Value |
|----------|--------|
| Background | `#050505` |
| Content width | `600px` |
| Default font | `Inter`, `SF Pro Text`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Helvetica Neue`, Arial, sans-serif |
| Link color | `#00F0FF` (sparingly) |

## Glass header (HTML block)

Email-safe “glass”: layered **gradient + border + soft violet outer glow** (no `backdrop-filter` in many clients).

| Property | Suggested value |
|----------|-----------------|
| Background | `linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(18,18,20,0.92) 100%)` |
| Border | `1px solid rgba(255,255,255,0.1)` |
| Border radius | `16px` |
| Box shadow | `0 0 48px rgba(112,0,255,0.12)` |
| Padding | `20px 24px` |

## Hero card (single column, center-aligned)

Keep headline **≤ 20 words**. Subline one sentence.

| Block | Property | Value |
|-------|-----------|--------|
| Heading | Font size | `28px`–`32px` |
| Heading | Font weight | `800` |
| Heading | Letter spacing | `-0.02em` |
| Heading | Color | `#E4E4E7` |
| Heading | Line height | `1.15` |
| Paragraph | Font size | `16px` |
| Paragraph | Line height | `1.6` |
| Paragraph | Color | `#E4E4E7` at ~85% opacity or `#A1A1AA` for secondary |
| Status (optional) | Font | Monospace |
| Status | Color | `#6B7280` |
| Button | Background | `#00F0FF` |
| Button | Text | `#050505`, **bold** |
| Button | Border radius | `8px` (or `999px` pill) |
| Button | Padding | `14px 28px` |

**Section padding:** `32px` top, `40px` sides, `24px` bottom.

### Accessibility (Cyber Cyan button)

- **Foreground `#050505` on background `#00F0FF`:** contrast **> 12:1** (exceeds WCAG AA for text and UI components).
- If you ever use **white** text on `#00F0FF`, re-check contrast (often still AA for large text); prefer **`#050505`** for buttons as specified.

## Dividers

| Property | Value |
|----------|--------|
| Color | `#1F1F23` |
| Width | `1px` |
| Margin | Use row/section padding for vertical rhythm (e.g. `24px` block) |

## Bento feature grid (2×2, 60 / 40 split)

Use **Columns** (not only stacked rows). Two rows; each row = **60% | 40%** asymmetric pair.

| Column | Width | Background |
|--------|-------|------------|
| Primary | `60%` | `#121214` |
| Secondary | `40%` | `#121214` |
| Border | — | `1px solid rgba(255,255,255,0.1)` |
| Radius | — | `12px` |
| Inner padding | — | `16px`–`20px` |

**Images (16:9):** In Unlayer, set a fixed **height** from width ÷ 16 × 9 (e.g. 280px wide → 157px tall). Prefer **cover** behavior: many clients need inline styles on the image or an HTML block; see `blueprint.mjml` comments.

**Data / labels inside cards:** Monospace, `#6B7280`, 12–13px.

## Trust — Social

| Property | Value |
|----------|--------|
| Icon / link color | `#9CA3AF` (monochrome) |
| Row padding | `24px` vertical, `40px` horizontal |

## Utility footer — 3-column Menu

| Property | Value |
|----------|--------|
| Section background | `#0a0a0a` or `rgba(0,0,0,0.5)` on `#050505` |
| Column split | `33%` / `34%` / `33%` |
| Group title | `12px`, weight `700`, `#E4E4E7` |
| Links | `13px`, `#9CA3AF`, line-height `1.8` |

## HTML block — accent glow (optional)

```html
<td style="border-radius:8px;background-color:#00F0FF;box-shadow:0 0 28px rgba(0,240,255,0.35), 0 0 60px rgba(112,0,255,0.15);">
  <a href="#" style="display:inline-block;padding:14px 28px;font-weight:700;color:#050505;border-radius:8px;font-family:inherit;">Launch</a>
</td>
```

## Import paths

- **MJML:** [`blueprint.mjml`](./blueprint.mjml) — compile to HTML, then paste or import.
- **HTML:** [`blueprint.html`](./blueprint.html) — reference or HTML block in Unlayer.

## Unlayer block mapping

| Region | Blocks |
|--------|--------|
| Glass shell | **HTML** (header) + optional **Section** padding |
| Hero | **Heading**, **Text**, **Button** |
| AI status | **Text** (monospace font) or **HTML** |
| Dividers | **Divider** (`#1F1F23`, 1px) |
| Bento | **Section** → **2 Columns** (60/40); per column background `#121214`; **Image**, **Text**, **Menu** |
| Trust | **Social** (monochrome icons) |
| Footer | **Section** → **3 Columns** + **Menu** / **Text** links |
