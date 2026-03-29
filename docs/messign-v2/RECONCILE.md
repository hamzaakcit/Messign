# Baseline reconciliation (v2)

- **When**: Implementation batches should confirm `git status` / target files on `HEAD` before large edits.
- **Pillars**: Dashboard (`MainDashboard`), Chat (`ChatV2Layout`), Projects (`ProjectsView`), Marketing (`MarketingLayout` / `MarketingHub` / `LucyMarketingPage`), shell (`AppShell` / `MainContent`).
- **Primitives**: `ViewportContainer`, `BentoGrid`, `BentoModule` live under `client/src/components/layout/`.
