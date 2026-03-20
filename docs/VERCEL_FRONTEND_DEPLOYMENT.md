# Vercel frontend: production vs local, caching, and route map

This document records how the **Messign** SPA is deployed to `messign.vercel.app`, why the live site can look “stuck” on an old UI, and how to verify each layer.

## Production project (verified via `vercel project inspect messign`)

| Setting | Value |
|--------|--------|
| **Root Directory** | `client` |
| **Framework** | Vite |
| **Build Command** | `npm run build` (runs in `client/`) |
| **Output** | Vite default (`client/dist`) |
| **Production aliases** | `messign.vercel.app`, `messign-git-main-*.vercel.app` |

**Important:** With **Root Directory = `client`**, Vercel reads [`client/vercel.json`](../client/vercel.json). The monorepo-level [`vercel.json`](../vercel.json) (install/build/output from repo root) is **not** applied unless you change the project to build from the repository root and point **Output Directory** to `client/dist`.

## Deployment vs local dev

- `npm run dev` in `client` only updates your machine. **Production updates only after a successful deploy** (usually `git push` to the branch connected to Production, typically `main`).
- Latest Production deployment status can be checked with: `vercel ls messign` and `vercel inspect <deployment-url>`.

## Git / branch alignment (run in repo root)

```bash
git status -sb
git fetch origin && git rev-parse HEAD origin/main
```

If you have **uncommitted or unpushed** changes, `messign.vercel.app` will not show them until you commit, push, and the new deployment is **Ready**.

## Why the UI looked “old” (common causes)

1. **Changes not on Production** — work only local or on a non-production branch; Preview URLs differ from `messign.vercel.app`.
2. **Root Directory mismatch** — editing only the root `vercel.json` while the project builds from `client/` has no effect on headers/build until Dashboard settings match.
3. **Caching** — After deploy, use a hard refresh, another browser, or Incognito. Hashed files under `/assets/` are safe to cache long-term (filename changes each build); [`client/vercel.json`](../client/vercel.json) sets long-lived cache for `/assets/*` so browsers keep hashed bundles but always pick up new hashes from a fresh `index.html`.

## Public vs in-app “marketing” routes

| URL | What renders | Source |
|-----|----------------|--------|
| `/login`, `/signup` | Login / sign-up (no app shell) | [`App.tsx`](../client/src/App.tsx) |
| `/` … (authenticated) | `AppShell` → `MainContent` | [`App.tsx`](../client/src/App.tsx) |
| `/marketing` | **Command Center** (cockpit default) | [`MarketingLayout.tsx`](../client/src/pages/marketing/MarketingLayout.tsx) |
| `/marketing/campaigns` | Campaigns list | same |
| `/marketing/command-center` | Command Center (alias path) | same |
| `/marketing/agent` | Marketing Agent | same |
| `/marketing/approvals` | Approvals queue | same |
| `/marketing/content` | Content calendar | same |
| `/marketing/leads` | Leads | same |
| `/marketing/email` | Email | same |
| `/marketing/dashboard` | Marketing dashboard | same |

Edits to **login** or **signup** live under `client/src/pages/LoginPage.tsx` (and related components), not under `pages/marketing/` unless you changed those files.

## Quick cache check (optional)

```bash
curl -sI "https://messign.vercel.app/" | grep -i cache-control
curl -sI "https://messign.vercel.app/assets/<hash-from-index.html>.js" | grep -i cache-control
```

After the next deploy, `/assets/*` should report long `max-age` + `immutable`; HTML should continue to revalidate so new builds swap the shell and new chunk hashes.
