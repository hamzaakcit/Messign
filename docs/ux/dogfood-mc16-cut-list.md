# Dogfood (MC-16) and cut list (MC-17)

**Date:** 2026-11-25. **Where:** the dev servers (surface `all`, development database, `SEND_MODE=live` in `server/.env`), in the browser, from `/marketing`. Drafts only: nothing was scheduled, approved or published, and Lucy was never opened.

## What was run

| Shop | Offer | Recipe | Result |
|---|---|---|---|
| Kitapyurdu | Tutunamayanlar | Cart reminder (email only) | Saved as a draft with a journey email (subject, ₺340, unsubscribe included). **Looks good** is enabled. Not clicked. |
| Lilyana | Papatya buketi | Occasion, post on | Saved as a draft with a post and a journey email. The still needed a press of **Regenerate** (Fal, 14 s, stored). **Looks good** stays disabled: the post has no caption, and nothing writes one. |

The Kitapyurdu offer finishes without Lucy. The Lilyana offer does not reach "ready for review" without Lucy (finding A).

## Fixed in this session

1. **The offer panel stayed stale after Regenerate.** The still was saved, but the open offer still said "No still yet" until the panel was closed and opened again. The panel reloaded the offer but not its children (the post). Fixed in `ContentDetailPanel`.
2. **The list stayed stale after anything done in the panel.** The offer list loaded once, so a new still, Looks good or Approve did not show on the card until a page reload. It now reloads when the panel closes (`LucyMarketingPage`).
3. **An email-only offer showed an empty still, "No caption yet." and "Scene sent to Fal: …"** although no post or image exists. They are hidden when the offer has no post (`OfferDetailView`, `OfferSheetDetail`).

Each has a test that fails on the old code (`offerSheetDetail.test.tsx`, `LucyMarketingPage.test.tsx`).

## Fixed by MC-18 (2026-11-25): findings A, B and C

A is closed by a **Write caption** action on the offer (the model writes it from the offer sheet; see the weekly progress entry). B and C went with it: the post panel no longer says "Lucy is writing the caption" and the first picture button reads **Make still**. They stay in the table below as the record.

## Open findings

| # | Finding | Why it matters | Suggested |
|---|---|---|---|
| A (fixed, MC-18) | **No way to get a caption.** New offer creates the post with an empty caption. The offer view has no caption field and no "write caption" action, and the post panel shows "0 / 2,200" with no editable field. Looks good needs the still and the caption, so a product drop or an occasion with a post cannot be marked ready without opening Lucy. | Breaks MC-16's acceptance for any offer with a post. | New work package MC-18: a "Write caption" action on the offer (server draft, editable text). Decision for you: generate with the creative model, or type by hand first. |
| B (fixed, MC-18) | The post panel says "Lucy is writing the caption. This usually takes a minute." when nothing started. | A promise nothing keeps. | Replace with the real state once A exists. |
| C (fixed, MC-18) | The first still is made by a button labelled **Regenerate**; nothing makes it on save. | Reads as a repeat of something that never ran. | Label it "Make still" when there is none, or start it on save (cost decision). |
| D | An email-only offer still walks the Picture step (one line: "This saves the email only.") and the Words step asks for "Caption direction". | Two steps and a field that do not apply. | Skip Picture and rename the field for email-only recipes. |
| E | Form controls on New offer (selects, inputs) are dark on the paper page. The Picture step sits in a small inner scroll box at 1024×768, so "Reference photo" is cut off. The post panel (⋯ → Open Instagram post) is dark. | UX-D1 says paper everywhere. | One UX package on New offer and the post panel. |
| F | The shop switcher's accessible name is its current value ("Messign"), not "Content tenant". | Screen readers lose the label. | Add `aria-label`. |
| G | The post panel fetches the same content row five times on open. | Wasted calls. | Dedupe in `ContentDetailPanel`. |
| H | Every page logs 404s for `/api/reimbursements/counts` and `/api/approvals/counts`. | Company-OS shell, not marketing. | Out of scope here. |

## Cut list (MC-17)

Written down, **not deleted**. The rule from the plan: anything not opened in the dogfood is a candidate. The input to the next quarter.

**Opened and used:** the offer list and its status chips, the shop switcher, New offer (all five steps), the offer view and its ⋯ menu, Regenerate, the post panel, the journey email block.

**Not opened by hand (kept; covered only by the mocked smoke test, UX-09):** Calendar (it needs an approved post, and no post could reach approved without a caption: finding A), Builder, Shop settings, and the More menu. Do not cut these before A is fixed and the calendar has been used on a real approved post.

**Candidates to drop, inside the post panel (opened, but duplicates of the offer view or the New offer page):**
- the **Format** toggle (Feed / Story / Reel): New offer's Picture step already sets it
- the second **Offer sheet** and the **Prompt Fal returned** block: the offer view already shows the sheet
- the second **Looks good**: the offer view has the one primary action
- the **Draft / Scheduled** toggle and the fake `@your_brand` preview header
- **Real photo (AI additive edit)** with **Choose photo**: the New offer page already takes a reference photo

**Not part of this list:** the Engage tabs (Customers, Journeys, Campaigns, Segments, Templates, Settings). They are the Engage product on the same page (ADR-016) and have their own suite.
