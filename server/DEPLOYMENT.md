# Messign backend — deployment (Render / Railway)

## Scripts

- **Build:** `npm run build` — compiles TypeScript to `dist/`
- **Start:** `npm run start` — runs `node dist/index.js` (production)
- The server listens on **`process.env.PORT`** (default `5000`). Set `PORT` on Render/Railway; the platform assigns it.

## CORS

The server allows requests from:

- **https://messign.vercel.app** (production frontend)
- **http://localhost:5173** (local Vite dev)
- **http://localhost:3000** (local app on port 3000)

Configured in `src/index.ts` (Express and Socket.io).

## Environment variables

Set these in the Render/Railway dashboard (or in a `.env` file for local runs).

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname` |
| `JWT_SECRET` | Secret for access tokens (or use `JWT_ACCESS_SECRET`) | long random string |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens (optional; falls back to `JWT_SECRET`) | long random string |

### Optional (server behavior)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP port (Render/Railway set this automatically) | `5000` |
| `NODE_ENV` | `production` or `development` | — |
| `UPLOAD_DIR` | Directory for uploaded files (Phase 5: replace with cloud storage — Supabase/R2) | `./uploads` (relative to cwd) |

### Optional (AI / Knowledge Hub)

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq API for Dora / knowledge answers |
| `GOOGLE_GEMINI_API_KEY` | Google Gemini for knowledge answers |
| `ANTHROPIC_API_KEY` | Claude for OCR, knowledge search, embeddings |
| `OPENAI_API_KEY` | OpenAI for RAG embeddings |

### Marketing Agent — image generation & storage (Railway)

The Marketing Instagram flow calls LiteLLM for image generation and uploads to Supabase Storage. If these are missing, generation can fail or the UI may show **placeholder URLs** that do not load in the browser.

| Variable | Description | Default / note |
|----------|-------------|----------------|
| `LITELLM_GATEWAY_URL` | Base URL of your LiteLLM (or compatible) gateway | Often `http://localhost:4000` locally; **must** be set in production to a reachable URL |
| `LITELLM_MASTER_KEY` | API key the server sends to the gateway (if required) | — |
| `SUPABASE_URL` | Supabase project URL | Without this + service role, uploads fall back to mock storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for server-side uploads | — |
| `MARKETING_IMAGE_BUCKET` | Storage bucket for marketing images | Optional; defaults apply when configured |

**Mock storage:** If Supabase is not configured, the server may still “succeed” at storing a URL under `https://storage.mock.local/...`. That URL **will not render** in the app or browser—configure real Supabase (or another upload target) for visible previews and downloads.

**Enable real URLs (local or production):**

1. **Supabase project** — In the dashboard: **Project Settings → API**. Copy **Project URL** → `SUPABASE_URL` and **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never commit to git or put in Vite env).
2. **Storage bucket** — Either:
   - **Storage → New bucket**: name `marketing-images` (or set `MARKETING_IMAGE_BUCKET` to match), enable **Public** so `/object/public/...` URLs load in the browser; or  
   - **Supabase CLI** (from repo root): `supabase link --project-ref <YOUR_REF>` then `supabase db push` to apply [`supabase/migrations/`](../supabase/migrations/) (see [`supabase/README.md`](../supabase/README.md)); or  
   - Run [`db/supabase-marketing-images-bucket.sql`](db/supabase-marketing-images-bucket.sql) in **SQL Editor** (same SQL as the migration).
3. **Server env** — Add the variables to `server/.env` locally or to your host’s secrets (Railway/Vercel **server** runtime). See commented blocks in `server/.env.example`. Restart the API after changing env.
4. **Verify** — Regenerate a marketing image; logs should not show `No Supabase config — returning mock URL`, and the returned `image_url` should start with your `SUPABASE_URL` and include `/storage/v1/object/public/`.

Optional model override: `IMAGE_GEN_MODEL` (e.g. if your LiteLLM alias differs from the default).

### Optional (invoices / company)

| Variable | Description | Default |
|----------|-------------|---------|
| `COMPANY_NAME` | Company name on invoices | Messign Communications |
| `COMPANY_ADDRESS` | Company address | Delaware, USA |
| `COMPANY_REG_NUMBER` | Registration number | 13799611524 |
| `COMPANY_VAT_NUMBER` | VAT number | 030319941 |
| `INVOICE_PREFIX` | Invoice number prefix | MSG |

### Optional (other)

| Variable | Description |
|----------|-------------|
| `GRAPHHOPPER_API_KEY` | Mileage / distance (GraphHopper) |
| `ACCESS_TOKEN_EXPIRY` | JWT access expiry (e.g. `15m`) |
| `REFRESH_TOKEN_EXPIRY` | JWT refresh expiry (e.g. `7d`) |

## Copy-paste list for Render/Railway

Add these in the dashboard; leave optional ones unset if not used.

```
DATABASE_URL
JWT_SECRET
JWT_REFRESH_SECRET
PORT
NODE_ENV
UPLOAD_DIR
GROQ_API_KEY
GOOGLE_GEMINI_API_KEY
ANTHROPIC_API_KEY
OPENAI_API_KEY
LITELLM_GATEWAY_URL
LITELLM_MASTER_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
MARKETING_IMAGE_BUCKET
IMAGE_GEN_MODEL
COMPANY_NAME
COMPANY_ADDRESS
COMPANY_REG_NUMBER
COMPANY_VAT_NUMBER
INVOICE_PREFIX
GRAPHHOPPER_API_KEY
ACCESS_TOKEN_EXPIRY
REFRESH_TOKEN_EXPIRY
```

## Phase 2 — Migrate local Postgres to Railway

Use this when moving from a local PostgreSQL database to Railway.

1. **Sign up:** Go to [railway.app](https://railway.app) and sign in with GitHub.
2. **New project:** Create a new project; then **+ New → Database → PostgreSQL**. Railway provisions a Postgres instance and exposes `DATABASE_URL` in the service variables.
3. **Copy `DATABASE_URL`:** In the Railway dashboard, open the PostgreSQL service and copy the `DATABASE_URL` (or the full connection string from the Variables tab).
4. **Dump local DB:** From your machine (with `psql`/`pg_dump` available), run:
   ```bash
   pg_dump -U your_local_user -d your_db_name -F c -f messign_backup.dump
   ```
   Replace `your_local_user` and `your_db_name` with your local Postgres user and database name.
5. **Restore to Railway:** Use the **resolved** `DATABASE_PUBLIC_URL` from the Railway Postgres service **Variables** tab (the value Railway shows with the real host and port, not the `${{...}}` template). From your project root (where the `.dump` files are), run:

   **Main app:**
   ```bash
   pg_restore --no-owner --no-privileges \
     -d "YOUR_PUBLIC_URL" \
     messign_main.dump
   ```

   **Knowledge-hub** (same Railway Postgres database; restore second):
   ```bash
   pg_restore --no-owner --no-privileges \
     -d "YOUR_PUBLIC_URL" \
     messign_knowledge.dump
   ```

   Replace `YOUR_PUBLIC_URL` with the actual `DATABASE_PUBLIC_URL` value from Railway (e.g. `postgresql://postgres:****@proxy.railway.internal:5432/railway` or the public TCP proxy URL Railway displays).

6. **Configure app:** Set `DATABASE_URL` in your Railway project (and in the server/knowledge-hub service env) to the Railway Postgres URL so the app uses the migrated database. Use the private `DATABASE_URL` (with `RAILWAY_PRIVATE_DOMAIN`) for server-side apps; use `DATABASE_PUBLIC_URL` only for restores from your local machine.

**pgvector:** If your dumps include tables that use the `vector` type (e.g. knowledge-hub embeddings, RAG), Railway’s default Postgres image may not have the `pgvector` extension. Enable pgvector via Railway’s Postgres extensions (if offered) or use a Postgres image that includes pgvector (e.g. `ankane/pgvector`), then re-run the restores.

## Deploy steps (Render / Railway)

**Auto-deploy from GitHub:** In Railway, connect this repository and deploy from branch `main` with **Root Directory** `server`. Each push to `main` builds and deploys the API without a separate webhook. Optional: add `RAILWAY_DEPLOY_HOOK` in GitHub Actions only if you use Railway’s deploy-hook URL instead of (or in addition to) Git integration—avoid double deploys on the same service.

1. Connect the repo; set **Root Directory** to **`server`** (or build/start from the `server` folder).
2. **Build command:** `npm install && npm run build`
3. **Start command:** `npm run start`
4. Add a PostgreSQL database and set `DATABASE_URL`.
5. Set the env vars above (at least `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`).
6. Deploy. The frontend at https://messign.vercel.app must call this backend’s URL (set `VITE_API_URL` or your app’s API base URL to the deployed server URL).

### Production checklist — Supabase + marketing images

Before or after each backend deploy, confirm the **Railway (or Render) server service** has:

| Variable | Value |
|----------|--------|
| `SUPABASE_URL` | **HTTPS** project URL only, e.g. `https://<project-ref>.supabase.co` — not a `postgresql://` string (`imageService` uses this for Storage REST). |
| `SUPABASE_SERVICE_ROLE_KEY` | **service_role** JWT from Supabase **Project Settings → API** (same secret as local; rotate if leaked). Never expose to Vite/client. |
| `MARKETING_IMAGE_BUCKET` | Optional; default `marketing-images` if the bucket migration was applied (`supabase db push` or SQL). |

The Storage bucket and migration apply to the **Supabase** project; Railway still uses **`DATABASE_URL`** pointing at **Railway Postgres** (or your primary app DB). Do not point `DATABASE_URL` at Supabase unless you intentionally migrated the app DB there.

**Redeploy backend:** push to the connected Git branch, or **Railway → service → Deploy → Redeploy**, so new env vars are picked up.

**Verify:** Regenerate a marketing image; logs must not show `No Supabase config — returning mock URL`, and `image_url` must start with your `SUPABASE_URL` host and `/storage/v1/object/public/`.

**CLI (optional)** — from your **actual** repo root (e.g. `~/messign-workspace`), one command per line; do not paste `#` comments on the same line as `railway` (the CLI treats `#` as an argument).

```bash
cd ~/messign-workspace
npx @railway/cli@latest login
npx @railway/cli@latest link
npx @railway/cli@latest up
```

If `link` is already configured for this folder, skip `link`. Install globally with `npm i -g @railway/cli` if you prefer `railway` instead of `npx`.

## Marketing module (Phase 4 + 5)

Before production cutover for marketing operations, calendar, budget/finance sync, and the background publisher:

1. Run migrations **075–078** on production Postgres (see [`docs/MARKETING_PRODUCTION_CHECKLIST.md`](docs/MARKETING_PRODUCTION_CHECKLIST.md)).
2. Run server tests under `src/__tests__/modules/marketing/` and optionally `npm run launch:check` after DB + Redis are healthy.
3. Publisher cron: `startMarketingPublisherCron()` runs every minute unless `MARKETING_PUBLISHER_ENABLED=0`.
