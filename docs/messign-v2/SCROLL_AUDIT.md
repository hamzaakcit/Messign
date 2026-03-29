# Scroll audit — primary surfaces

| Surface | Route / entry | Outer document scroll | Scroll owner | Notes |
|--------|----------------|----------------------|--------------|--------|
| App shell | all authenticated | **No** (`h-screen overflow-hidden`) | — | `AppShell.tsx` |
| Main content | all | **No** (`flex-1 min-h-0 overflow-hidden`) | — | `MainContent.tsx` |
| Dashboard | `/`, `/dashboard` | **No** | None; modules scroll inside tiles | `ViewportContainer` + `MainDashboard` + `BentoGrid` |
| Chat | `/chat` | **No** | Channel list, message list, thread rail | `ChatV2Layout` + `ViewportContainer` row |
| Projects | `/projects` | **No** | Marketplace `TabsContent`, task board column | `ViewportContainer`; vitals/activity columns `overflow-hidden` |
| Marketing Lucy | `/marketing` | **No** | Inner bento / Dora rail | `ViewportWrapper` → `ViewportContainer` |
| Marketing workspace | `/marketing/workspace` | **No** | Kanban columns, command center compact region, calendar | `MarketingHub` flex chain |
| Marketing builder | `/marketing/builder` | **No** | `<main>` scroll for `BuilderSection` | Internal `overflow-y-auto` on main |
| Marketing intelligence | `/marketing/...` segment | **No** | Competitor dashboard inner | `overflow-hidden` on main |

**Rule**: Only **internal** panes use `overflow-y-auto` / virtualized lists; feature roots use `ViewportContainer` or equivalent `min-h-0` + `overflow-hidden`.
