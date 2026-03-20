# Marketing Command Center — UI/UX Specification (Single-Pane Cockpit)

**Role:** Lead UI/UX (AI-native OS)  
**Goal:** Replace tab-hopping with one **single-pane-of-glass** where users plan, draft, validate, and queue **without leaving the page**.

> **Note:** External PDFs referenced in design briefs may not be in-repo; this spec is self-contained and aligned with Messign’s existing `text-app` / `border-app-border` token patterns.

---

## 1. Component hierarchy (React tree)

```text
MarketingCommandCenterPage (route: /marketing/command-center)
├── MarketingNav (shared top tabs — optional compact variant)
├── CommandCenterShell (full viewport height, grid)
│   ├── StrategyVault (left, collapsible)
│   │   ├── VaultHeader + collapse toggle
│   │   ├── CampaignContextSwitcher (reads/writes ?campaignId= in URL)
│   │   ├── ProductTruthStrip (feature registry summary / live API)
│   │   └── BrandVoiceMonitor (tone chips + link to brand settings)
│   ├── CreativeCanvas (center, min-w-0)
│   │   ├── OmniChatPanel (Dora / marketingAgentMode)
│   │   ├── DraftCardList
│   │   │   └── DraftCard (expandable; selected → syncs ?contentId=)
│   │   │       ├── VariantTabs (A/B inside card)
│   │   │       └── InlineEditor (textarea / tiptap — no modal)
│   │   └── CanvasFooter (optional: save state, version)
│   └── GatekeeperOps (right, dynamic)
│       ├── GatekeeperHeader (binds to active ?contentId=)
│       ├── TelemetryPanel (Truth / Brand / Compliance — reuse approvals UI patterns)
│       ├── ApproveQueueBar (sticky: Approve & Queue)
│       └── BudgetImpactWidget (campaign slice vs total — finance API)
└── (optional) SlideOverPanel / Sheet for mobile-only vault or gatekeeper
```

---

## 2. State management: “Active Content” (Center ↔ Right)

**Primary source of truth: the URL** (shareable, refresh-safe, back/forward friendly).

| Param | Purpose |
|-------|---------|
| `campaignId` | Active campaign for Strategy Vault + budget widget |
| `contentId` | Active draft/asset card; **Right column** subscribes to this id |

**Mechanics:**

1. Selecting a **Draft Card** in the center calls `setSearchParams({ contentId })` (merge with existing params).
2. **Gatekeeper & Ops** reads `contentId` from `useSearchParams()` and loads validation telemetry + approval actions for that row (same pattern as [`MarketingContentPage`](client/src/pages/marketing/MarketingContentPage.tsx) using `selectedContentId`, but lifted to **URL**).
3. Optional **React Context** `CommandCenterContext` for ephemeral UI only: `expandedCardId`, `leftVaultCollapsed`, `editorDirty` — must **not** replace `contentId` in the URL.

```text
User selects card → URL ?contentId=uuid → Center highlights card → Right fetches gatekeeper payload for that id
```

---

## 3. Visual aesthetic: “Modern Noir” (AI-native OS)

- **Canvas:** Deep charcoal base `#0b0d10`–`#12151a`; surfaces one step lighter `#161a22`.
- **Borders:** Hairline `border-white/10` or `border-app-border` (theme-aware); avoid heavy drop shadows.
- **Accent:** One cool accent (e.g. cyan or electric blue) for primary actions, PASS chips, and focus rings only.
- **Typography:** Tight hierarchy — page title `font-semibold`, body `text-sm`, meta `text-xs text-app-muted`.
- **Density:** **High** in left/right rails; **breathing room** in center chat. Feels like a **cockpit**, not a marketing blog.

*(Alternative “Clean Enterprise”: light `bg-slate-50`, `border-slate-200`, `text-slate-900` — same grid.)*

---

## 4. Tailwind: responsive “Command Center” grid

**Desktop:** three columns; **Tablet:** stack or collapse right; **Mobile:** single column + sheets.

```tsx
/* Outer shell — full height below app chrome */
<div className="flex min-h-0 flex-1 flex-col bg-[#0b0d10] text-slate-100">
  <div
    className="grid min-h-0 flex-1 gap-0 border-t border-white/10 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)_minmax(0,320px)] lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,380px)]"
  >
    <aside className="hidden min-h-0 flex-col border-r border-white/10 bg-[#0f1218] md:flex">
      {/* Strategy Vault */}
    </aside>
    <main className="flex min-h-0 min-w-0 flex-col border-x border-white/5 bg-[#12151a]">
      {/* Creative Canvas */}
    </main>
    <aside className="hidden min-h-0 flex-col border-l border-white/10 bg-[#0f1218] xl:flex">
      {/* Gatekeeper & Ops */}
    </aside>
  </div>
</div>
```

**Tablet:** show right column below or as `fixed` drawer; use `max-xl:hidden` on right + `Sheet` trigger.

**Key tricks:** `min-w-0` on grid children; `min-h-0` on flex scroll parents; `lg:grid-cols-[280px_minmax(0,1fr)_380px]` keeps a **fixed-feel** command deck on large screens.

---

## 5. Implementation status

- **Layout shell:** [`MarketingCommandCenterPage.tsx`](../client/src/pages/marketing/MarketingCommandCenterPage.tsx) — routed at `/marketing/command-center`.
- **Next steps:** Wire `contentId` to `TelemetryPanel` / approval APIs; embed full `useDora` chat in center; add draft cards from `marketingAPI.listContent`.
