# Vercel deployment (messign frontend)

The build fails with **"Could not read package.json"** when Vercel’s **Root Directory** doesn’t point at a folder that has a `package.json`.

The repo includes a root [`vercel.json`](vercel.json) with `installCommand`, `buildCommand` (`npm run build:client`), `outputDirectory` (`client/dist`), and SPA `rewrites`. Deploy with **`npx vercel deploy --prod`** from the **repository root** (not from `client/`, or Vercel may resolve `client/client`).

Use **one** of these:

## Option A – Deploy from repo root (recommended)

1. **Root Directory:** leave **empty** (or `.`).
2. **Build Command:** `npm run build:client` (or leave default; root `vercel.json` sets it).
3. **Output Directory:** `client/dist` (root `vercel.json` sets it).

Vercel will use the repo root, find the root `package.json`, run `npm install` and `npm run build:client`, and serve from `client/dist`.

## Option B – Deploy from `client` folder

1. **Root Directory:** `client` (exactly, no slash).
2. **Build Command:** `npm run build` (or leave default; `client/vercel.json` sets it).
3. **Output Directory:** `dist` (`client/vercel.json` sets it).

Vercel will use the `client` folder; `client/package.json` must exist in your repo.

---

**If you still see ENOENT:** In Vercel → **Settings** → **General** → **Build & Development Settings**, clear **Root Directory** completely (leave it blank) and save, then redeploy.
