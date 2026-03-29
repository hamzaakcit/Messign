# ADR-001: Sheet / Dialog overlay strategy (Messign v2)

## Status

Accepted (2026).

## Context

The app uses:

- **Radix Dialog** — `client/src/components/ui/dialog.tsx` (`@radix-ui/react-dialog`).
- **Radix-based Sheet** — `client/src/components/ui/sheet.tsx` (side panels, same primitive family as upstream shadcn).
- **Legacy `SlideOverPanel`** — wide marketing/detail drawers, custom z-index and focus trap.
- **Legacy `Modal`** — centered modals; being phased toward Dialog for new work.

## Decision

1. **New centered overlays**: Prefer **`Dialog` / `DialogContent`** from `components/ui/dialog.tsx` with `rounded-lg` and `border-app-border` overrides where needed.
2. **New side overlays**: Prefer **`Sheet` / `SheetContent`** from `components/ui/sheet.tsx` for standard right/left drawers.
3. **Legacy wide panels**: Keep **`SlideOverPanel`** for existing marketing content/campaign slides until a dedicated migration pass; it remains the reference for very wide (e.g. 1200px) panels.
4. **No duplicate Radix install**: A single `@radix-ui/react-dialog` package backs both Dialog and Sheet patterns.

## Consequences

- Bundle: one Radix dialog dependency; no extra `@radix-ui/react-dismissable-layer` package required separately.
- Consistency: Propose Project and similar flows migrate from `Modal` → `Dialog` over time.
