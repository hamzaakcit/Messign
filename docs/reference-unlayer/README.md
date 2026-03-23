# Unlayer reference exports (Messign email parity)

Four HTML exports from Unlayer (saved from your Downloads) are stored here as **`.zip`** archives. Unzip any archive into `extracted-<name>/` to inspect `index.html` and `images/` (local assets).

| Archive | Notable patterns (from `index.html`) |
|---------|--------------------------------------|
| `1774094565077-Xre1UcsEjAEtmUwQ.zip` | `u-row-container` with **background-image** on container; `u-row` **transparent**; first row logo image; second block uses **full-bleed env** (`background-image: url('images/image-13.png')`) — **environmental layering** |
| `1774094611080-m4CZP6YLTAi6OydU.zip` | **Crushed display type**: `#u_content_heading_1` / `#u_content_heading_11` → **49px** with `line-height: 10%` / **`100%`** at `max-width: 480px`; **`#u_content_divider_1`** → **`padding: 13px 10px 10px`**; columns **`u-col-60p17`** (361.02px) / **`u-col-39p83`** (238.98px), **`u-col-22p67`** (136.02px) / **`u-col-77`** (462px); buttons **`width: 65%`** (`#u_content_button_*` `.v-size-width`) |
| `1774094661474-ybzKyEW2yimniDSJ.zip` | Alternate campaign; same **u-row** / **u-col** system |
| `1774094700319-i7YLJXjh5lTPPSja.zip` | **`u-col-59p17`** (355.02px) / **`u-col-40p83`** (244.98px); **`u-col-61p33`** / **`u-col-38p67`**; dense **`@media (max-width: 480px)`** rules with **`#u_content_*`** IDs |

**Parity target:** [`client/public/marketing/unlayer/templates/architect-layering-2026/`](../../client/public/marketing/unlayer/templates/architect-layering-2026/) — [`DESIGN_TOKENS.md`](../../client/public/marketing/unlayer/templates/architect-layering-2026/DESIGN_TOKENS.md) lists Unlayer class names and pixel widths at **600px** row width. See also [`ARCHITECT_MASTER_PROMPT.md`](../../client/public/marketing/unlayer/templates/architect-layering-2026/ARCHITECT_MASTER_PROMPT.md) and [`UNLAYER_STYLES.md`](../../client/public/marketing/unlayer/templates/architect-layering-2026/UNLAYER_STYLES.md).
