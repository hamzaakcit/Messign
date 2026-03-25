# Vercel deployment (messign frontend)

The build fails with **"Could not read package.json"** when Vercel’s **Root Directory** doesn’t point at a folder that has a `package.json`.

The repo includes a root [`vercel.json`](vercel.json) with `installCommand`, `buildCommand` (`npm run build:client`), `outputDirectory` (`client/dist`), and SPA `rewrites`. The root **`npm run build`** script also builds the **client** (same as `npm run build:client`), so Vercel’s default “`npm run build`” no longer runs the server build. Deploy with **`npx vercel deploy --prod`** from the **repository root** (not from `client/`, or Vercel may resolve `client/client`).

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

---

## Black screen after a successful deploy

1. **Open DevTools → Console** on the production URL. A red error (failed chunk load, uncaught exception) usually explains it.
2. **Network tab:** confirm `index.html` returns 200 and `/assets/*.js` load with 200 (not HTML). If JS returns 404 or SPA HTML, check **Output Directory** is `client/dist` and **Root Directory** is empty (repo root).
3. **Environment:** In Vercel → **Settings** → **Environment Variables**, set **`VITE_API_URL`** to your **Railway API origin** (no `/api` suffix), not the Vercel URL. Redeploy after changing. Wrong API URL breaks auth and APIs; the app also guards against “logged in but no user” after a bad session.
4. **Stale session:** Try an incognito window or **Application → Clear site data** for the Vercel domain, then open `/login` again.

---

## Automatic deploy on push to `main` (GitHub Actions)

The workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on every push to `main` (and can be run manually under **Actions → Deploy production → Run workflow**).

1. **Vercel — Deploy Hook**
   - Vercel project → **Settings** → **Git** → **Deploy Hooks** → create a hook for **Production**, branch `main`.
   - Copy the hook URL.
   - GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** → name `VERCEL_DEPLOY_HOOK`, value = the URL.

2. **Railway — usually no GitHub secret**
   - In Railway, connect this GitHub repo and set the service to deploy the **`server/`** root (or your Dockerfile) from branch `main`. Railway will deploy on each push automatically.
   - Optional: if you use a **Deploy Hook** URL from Railway instead, add it as `RAILWAY_DEPLOY_HOOK` in GitHub Actions secrets. Do **not** use both Git-connected auto-deploy and a duplicate hook on the same service unless you intend double deploys.

3. **Environment**
   - After deploy, ensure **Vercel** has `VITE_API_URL` pointing at your Railway API URL (see [README](README.md) deploy section).
