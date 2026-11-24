# EQ reference analysis — batch 1 (22 Turkish emails, Nov 2026)

> Input to EQ-00 (benchmark), EQ-05 (banner compositor), EQ-06 (section library) and EQ-07 (recipes). Tags per email: `eval/email-benchmark/references.csv`. Source PDFs stay outside git: they contain the recipient's name, address, phone and order numbers. Redact these before any file reaches `eval/email-benchmark/references/`.

## 1. What we have

22 unique emails; 2 more were duplicates.

| Vertical | n | Brands |
|---|---|---|
| Florist / gifting | 2 | Çiçeksepeti ×2 |
| Beauty | 4 | Yves Rocher ×4 |
| Fashion | 2 | Silk and Cashmere ×2 |
| Food & beverage | 3 | Starbucks ×3 |
| Grocery | 1 | Cepte Şok |
| Marketplace transactional | 7 | n11 ×3, Trendyol ×3, Hepsiburada |
| Travel (tag only, not e-commerce) | 3 | Corendon, Hotels.com, Pegasus |

| Email type | n |
|---|---|
| Offer / sale | 9 |
| Occasion | 4 |
| New release | 1 |
| Transactional / post-purchase | 8 |
| **Cart reminder** | **0** |
| **Win-back** | **0** |
| **Bookstore** | **0** |

**Anchors** (the bar): R18 Çiçeksepeti "Son 1 Gün" (florist), R19 + R12 Silk and Cashmere (premium), R04 Starbucks Youthberry (new release), R17 Yves Rocher gift guide (structure), R02/R07 n11 (transactional system).
**Anti-patterns:** R05 Şok (everything shouts), R08 Trendyol invoice (category grid above the message), R11 spin wheel (out of scope).

## 2. Main finding: every marketing hero is a designed image

In all 14 marketing emails, the hero headline is **text baked into a designed image** (checked by text extraction: the headline isn't in the HTML text layer). Hotels.com and Corendon add a live headline *below or above* the image. The "cool designed" look the founder wants comes from a designer composing type, product, colour and decoration in Figma or Photoshop. It doesn't come from HTML sections or from a photo.

Our pipeline can't get there today:
- HTML sections alone look like templates (sample 2 in the original brief).
- Fal can't produce correct Turkish type (ı ş ğ ü ç İ) or exact prices, and CP-D7 rightly keeps price and claims out of the image prompt.

**Decision (amends the EQ plan):** add a **banner compositor**. It builds designed banners from HTML/CSS templates and renders them server-side in headless Chromium (Playwright is already in the repo) to JPEG/PNG at 2× slot width. Inputs:
- brand palette roles and the font pair (real webfonts, correct Turkish glyphs)
- headline, kicker and price from the **offer sheet and truth rows**, never written by the image model
- product photo or cutout
- optional Fal mood background
- decoration tokens (arch mask, ribbon, roundel, chip, botanical accents)

Rules:
- At most 2 composed banners per email.
- The banner's message is always **also live text**: a full-sentence `alt` plus the headline or CTA as HTML next to it. Images-off, Gmail and screen readers must never lose the offer (R20 pattern: offer + CTA live above the image).
- Price in a banner comes only from truth.

The deterministic fill means no new legal surface.

## 3. Patterns to build (ranked by frequency × fit for small shops)

| # | Pattern | Seen in | Becomes |
|---|---|---|---|
| 1 | **Offer as giant typography** (number + currency + qualifier, label chip) | R03, R06, R13, R19, R20, R22 | Compositor template `big-number`; HTML section `discount-block` (R19 shows it works in live type too) |
| 2 | **Brand-band hero**: kicker date line, serif or heavy headline, short sub, light CTA on a band, product photo masked (arch/rounded) below or beside | R01, R18, R04 | Compositor template `band-hero` (florist/bookstore occasion default) |
| 3 | **Price-tier gift guide**: tier header band ("400 TL altı") + 2-up product cards (photo on tint, name, contents, label, price, CTA) | R17 | Sections `tier-header` + `product-card-2up`. Recipe `occasion-gift-guide` (max 2 tiers × 2–4 products: R17's length is the anti-pattern) |
| 4 | **Alternating category rows** (image one side, title + boxed CTA the other) | R03, R20 | Section `category-row` (left/right variants) |
| 5 | **Icon benefit trio + service band** (free shipping / delivery / support) | R03, R06, R11, R17, R19 | Section `benefit-trio` (thin-line icons in accent colour, R19) — shop-level content, set once in shop settings |
| 6 | **Dark editorial band** with framed photo grid or mosaic | R12, R19 | Section `editorial-band` (premium recipes) |
| 7 | **Ticker / marquee strip** as divider | R12, R19 | Divider variant `ticker` (static text row, email-safe) |
| 8 | **Segment buttons** (Kadın / Erkek, or Roman / Çocuk for books) as stacked outline buttons | R12, R19 | CTA variant `segment-stack` |
| 9 | **Deadline chip** on the hero ("SON GÜN: 7 ARALIK", "SADECE BUGÜNE ÖZEL") | R11, R22, R03 | Compositor token `chip` + live preheader line |
| 10 | **Transactional card system**: tinted status card (icon + status + primary button), line-item card, help rows with icons | R02, R07, R14 | Section `status-card`, `line-items` → used by the **cart summary card** in cart reminders |
| 11 | **Overlapping label bar** on photo edge | R16, R22 | Compositor only (overlap is unsafe in Outlook as HTML) |

## 4. What to avoid (lint or recipe rules)

- More than one dominant accent colour plus brand (R05). Palette roles cap accents at 1.
- Category grids, nav bars and app-download bands above the core message (R08, R14). Footer only, and the app band only if the shop has an app.
- Emails longer than about 3 screens (R17 runs 6 pages, R12 is very long). Recipe cap: 5–7 sections.
- Legal walls in the body (R11, R22). Terms go into one small footnote block in the footer.
- People stock photos (R10 wooden smileys, R16). Product-first imagery, matching principle 3.
- QR codes, spin wheels, partner promos: out of scope.

## 5. Gaps for the benchmark

The benchmark needs bookstore, cart-reminder and win-back references. Three ways to get them:
1. **Trigger them:** log in to Kitapyurdu, D&R, Idefix and Çiçeksepeti, add an item to the cart and leave. Cart reminders usually arrive within 1–24 h.
2. **Public galleries** (Really Good Emails, Milled) for win-back and bookstore, collected in a later session.
3. Accept the gap and anchor bookstore on florist patterns 2 and 3. That's the fallback.
