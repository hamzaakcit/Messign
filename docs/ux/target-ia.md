# Marketing: Target Information Architecture

**As of:** 2026-11-24, after UX-01 and the merge with WP-37 (ADR-016). This is a recommendation; screens marked *today* exist on `main`.

## Top level (≤ 5 items)

| Item | What it is | Today | Target |
|---|---|---|---|
| **Offers** | The shop's offers: still, caption and journey email on each. The home | `/marketing` list + `/marketing/pipeline` board (two lists) | One list. Pipeline becomes a "by status" view of the same list (UX-04) |
| **Calendar** | Put a *ready* offer on a day; warns when a live send mode would publish | `/marketing/calendar`, accepts drafts | Ready offers only (UX-07) |
| **Email designs** | Unlayer email layouts and saved templates | `/marketing/builder`, email only (UX-D2) | Unchanged |
| **Shop settings** | Product truth rows, brand profile, language, handle | Floating "Brands" button over every screen | A page under the shop switcher (UX-05) |
| **Engage** *(organizations with engage)* | Customers, Journeys, Campaigns, Segments, Templates, Settings | Tabs after Offers on the same page (ADR-016) | Unchanged structure; adopts ADR-026 components when touched |

Not top-level:
- **Lucy** is help on any step: a drawer opened by "Ask Lucy". It is not a destination.
- **New offer** is the primary action, not a nav item.

Hidden or removed (UX-01): Intel, Brand & social, Funnel, Campaigns & lab, Lucy sandbox, CEO dashboard, landing pages, popups, atomize. Their routes redirect to `/marketing`; their backends are unchanged (ADR-001).

## Navigation: before and after

```
BEFORE (2026-11-14)                         TODAY (main, 2026-11-24)                    TARGET
/marketing                                  /marketing                                  /marketing
├─ More ▾  (8 links)                        ├─ New offer                                 ├─ New offer            [primary]
│   Pipeline Calendar Builder Intel         ├─ More ▾                                    ├─ Offers | Calendar | Email | Settings
│   Brand&social Funnel Campaigns Sandbox   │   Pipeline Calendar Builder                ├─ (engage tabs, if enabled)
├─ Workspace tab bar (4 + 4 under CC ▾)     │   [engage: Send email / New journey …]     └─ Ask Lucy             [drawer]
├─ Command-center shortcut buttons          ├─ Offers | Customers | Journeys | … (engage)
├─ Brands FAB (every screen)                ├─ Ask Lucy [drawer]
└─ Lucy composer: IG, LinkedIn, X, Blog,    └─ Brands FAB (every screen)
   Ads, Email×4, Metrics                       Lucy composer: Instagram, Email×4
```

The target replaces "More" with visible links, because three links don't need hiding. The engage tabs and the marketing links share one row when engage is enabled, so the page has one navigation row, not two.

## Wireframes (low fidelity)

### 1. Offers (home)
```
┌───────────────────────────────────────────────────────────────┐
│ [Kitapyurdu ▾]   Offers  Calendar  Email  Settings   (Ask Lucy)│
│                                                  [ New offer ] │
├───────────────────────────────────────────────────────────────┤
│  Kitapyurdu                                   [All ▾ status]   │
│  ┌─────────────────────────────┐                               │
│  │          (still)            │                               │
│  ├─────────────────────────────┤                               │
│  │ Kürk Mantolu Madonna  ₺189  │   Review                      │
│  └─────────────────────────────┘                               │
│  Empty: "No offers for Kitapyurdu."  [ New offer ]             │
└───────────────────────────────────────────────────────────────┘
```
The status filter absorbs the Pipeline board (UX-04). No metric tiles, no greeting.

### 2. New offer (five steps), as today
```
Product ─ Picture ─ Words ─ Preview ─ Looks good
┌───────────────────────────────────────┐
│ Product  [Kürk Mantolu Madonna ▾] (i) │   (i) "Price and claim come from the product row."
│ Price    ₺189      (read-only)        │
│                       [Back] [ Next ] │
└───────────────────────────────────────┘
```

### 3. Offer detail
```
┌ Kürk Mantolu Madonna ─────────────────────────── [ Looks good ] [⋯] ┐
│ (still, large)            │ Caption                                   │
│ Look: photoreal ▾  Frame  │ …                                         │
│ [Regenerate]              │ Journey email: Subject · Price · Window   │
│                           │ Unsubscribe line ✓          [Open design] │
└──────────────────────────────────────────────────────────────────────┘
⋯ = Draft · Schedule · Test publish (mock|live) · Copy export
```
One primary: "Looks good" (disabled until the still and caption exist, MC-08). The email is readable without Unlayer (MC-07).

### 4. Calendar
```
┌ November 2026 ─────────── [Today] [Month|Week|List] ┐
│ Mon  Tue  Wed …                                     │
│      [IG Kürk…]                                     │
└─────────────────────────────────────────────────────┘
Ready offers (drag onto a day):  [Papatya buketi]  [Kürk…]
⚠ SEND_MODE=live: a scheduled Instagram post will be published.   (shown only when live)
```

### 5. Shop settings
```
┌ Shop settings: Kitapyurdu ───────────────────────────┐
│ Brand    Name · Language · Instagram handle   [Edit] │
│ Products  (truth rows)                    [Add row]  │
│   Kürk Mantolu Madonna   ₺189   Karaköy vitrini      │
└──────────────────────────────────────────────────────┘
```
