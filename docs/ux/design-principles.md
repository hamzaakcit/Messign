# Marketing UX: Design Principles

**As of:** 2026-11-24. This is the master prompt's §3, made concrete with examples from this codebase. Every rule has a Do and a Don't taken from real screens. Use it as the review checklist for any marketing or engage UI change.

## 1. Every visible control works

A control is wired end to end (UI → API → database) or it is not rendered. A disabled control is allowed only when the user can make it available in the same flow, and it says why in one line on hover.

- **Do:** the pipeline board accepts only the two drops that change real state, and says so for the rest: "Posts go live from the calendar, not by dragging." (`lib/boardMoves.ts`).
- **Don't:** email "Send" that sets `status='sent'` and `delivered = recipient_count` with no provider call (removed in UX-01). Campaign "Edit" with no `onClick` (removed in UX-01).
- **Don't:** a fixed table presented as analysis ("Auto-schedule" picked from `OPTIMAL_SLOTS`, removed in UX-01). If the data is not the tenant's, say so or remove it.

## 2. One concept, one place

One canonical entry point per task. Navigation appears once.

- **Do:** New offer is the one way to start an offer. The Lucy composer's Instagram tile goes to the same page; it does not open a second form.
- **Don't:** the same eight destinations in the home's "More" menu *and* the workspace tab bar *and* command-center shortcut buttons (cut to three in UX-01).
- **Don't:** a "Go to" tile for every tab that is already a tab (dropped when the engage tabs moved onto the shop counter).
- **Open:** the home offer list and Pipeline still both list content (UX-04).

## 3. Text budget

Page title ≤ 5 words. Section header ≤ 4 words. No persistent explanatory paragraph. Body copy appears only where the user must act or decide.

- **Do:** "No offers for Kitapyurdu." plus a New offer button. That is the whole empty state.
- **Don't:** "Design in the visual builder, then apply… Set `VITE_UNLAYER_PROJECT_ID` locally and in Vercel…" in every builder header (removed in UX-01; ops text belongs in `DEPLOYMENT.md`).
- **Don't:** "Tap a channel for a guided brief (like Instagram). Lucy sends the full prompt or inserts it into the composer for edits." above three obvious tiles (removed).
- **Don't:** internal vocabulary in user copy: "VA2 design manifest JSON", "re-assembles from the manifest", "Ultra still path".

## 4. Explanations are hidden until asked for

Use one of three patterns:

| Need | Pattern | Rule |
|---|---|---|
| A label needs a hint | `(i)` InfoTip | Hover, focus or tap. One sentence, ≤ 120 characters |
| It takes more than a sentence | "Learn more" in the InfoTip opens the HelpDrawer | Text lives in `helpContent.ts`, keyed by id |
| First-time guidance | Empty state | One sentence and one primary action. It disappears once data exists |

Never a modal for an explanation. Never a paragraph that is always on screen.

- **Do:** the accessibility and regenerate notes in `Va2DiagnosticsPanel` sit behind `<details>`.
- **Don't:** the "Brand lock" note in the same panel is the only ungated block (copy-audit, move to an InfoTip in UX-02).

## 5. One primary action per screen

There is one filled button. Secondary actions go in a `⋯` menu.

- **Do:** New offer is the only filled action on the shop counter.
- **Don't:** the offer detail's row of equal-weight icon buttons (Draft, Scheduled, Test publish, Schedule) has no visible primary. Fixed in UX-06.

## 6. Progressive complexity

Advanced settings are collapsed by default. The five-step New offer is the model: product → picture → words → preview → Looks good. Each step shows only its own fields.

## 7. One component set, one theme rule

Kept marketing screens and engage screens use `client/src/components/ui` (ADR-026). Colour comes from **defined** tokens only.

- **Don't:** `text-app` and `bg-app`. Tailwind's `app` colour group has no `DEFAULT`, so these classes generate no CSS. They appear 908 times in 160 files and silently fall back to inherited colour. That is why the selected engage tab label was unreadable (fixed in this PR) and why panels on the paper shop counter showed dark-theme text on paper. Use `text-app-text`, `bg-app-bg`, `bg-app-card`. Since UX-03 a test bans the bare classes in marketing and engage.
- **Do:** one theme per page. `/marketing` is paper; engage parts on it are wrapped in `data-theme="light"` **and** given `text-app-text`, because elements that use the empty `text-app` inherit their colour from the wrapper (UX-D1).

## 8. Verify before claiming

"Works" means traced UI → handler → API → database, and exercised in a test or a real click. A static trace is labelled as static (`control-audit.md` does this).

## 9. Accessibility floor

Visible focus states. Every icon-only button has an `aria-label` (the offer detail's Schedule button got one in UX-01). Contrast meets AA on whichever background the element actually renders on, which is the background the browser computed, not the intended one (see §7).
