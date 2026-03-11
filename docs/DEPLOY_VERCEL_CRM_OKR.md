# Deploying CRM & OKR on Vercel + Backend

When the frontend is on **Vercel** (`messign.vercel.app`) and the backend is elsewhere (e.g. **Railway**), use this checklist to fix "Failed to list pipelines" and empty OKR page.

## 1. Backend URL (Vercel)

The client uses `VITE_API_URL` at **build time**. In Vercel:

- **Environment variable:** `VITE_API_URL` = your backend root URL (e.g. `https://server-production-7283.up.railway.app`).
- If you don’t set it, the code falls back to that Railway URL when `PROD` is true. If your backend is on a different URL, set `VITE_API_URL` in Vercel and redeploy.

## 2. Run migrations on the backend DB

CRM and OKR need their tables. On the machine or environment that can reach your **production** DB:

```bash
cd server
npx tsx src/migrations/runner.ts
```

- **Running from your local machine against Railway Postgres:** The server uses `DATABASE_PUBLIC_URL` when set (else `DATABASE_URL`). Railway’s `DATABASE_URL` uses the internal host (`postgres.railway.internal`), which is only reachable from inside Railway. So in `server/.env` set `DATABASE_PUBLIC_URL` to the **public** Postgres URL: in Railway open your Postgres service → **Connect** (or **Variables**) and copy the URL that uses a host like `*.proxy.rlwy.net` (TCP Proxy). Paste that into `DATABASE_PUBLIC_URL` in `server/.env`, then run the command above.
- This applies `045_sales_crm.sql` and `046_okrs.sql` (and any older migrations). Ensure the DB user has permission to create tables and that `organizations` has a row with `slug = 'messign'` (create it if your app expects it).

## 3. Reimbursement user (CRM/OKR auth)

CRM and OKR routes use **reimbursement auth**: they need `X-User-Id` and a matching row in `reimbursement_users`.

- The value sent as `X-User-Id` is the **main app** user id (e.g. auth user id).
- There must be a row in `reimbursement_users` with:
  - `organization_id` = your org (e.g. messign),
  - `auth_user_id` = that same main app user id.

If that row is missing, you get **403** and the UI can show "Failed to list pipelines". Add the row (or run your existing user/org seed that creates it).

## 4. Seed sample CRM + OKR data

After migrations (and org + reimbursement user) are in place, seed sample data so the pipeline and OKR pages show something:

```bash
curl -X POST "https://YOUR_BACKEND_URL/api/seed/crm-okr" \
  -H "Authorization: Bearer YOUR_SEED_SECRET"
```

Or with a header:

```bash
curl -X POST "https://YOUR_BACKEND_URL/api/seed/crm-okr" \
  -H "x-seed-secret: YOUR_SEED_SECRET"
```

Set `SEED_SECRET` or `CRON_SECRET` on the backend so the route accepts the request. The seed is idempotent: it creates the default pipeline + stages if missing, then adds sample companies, contacts, deals, and OKR goals only if none exist.

## Summary

| Issue | What to do |
|-------|------------|
| "Failed to list pipelines" | Backend URL correct in Vercel (`VITE_API_URL`), migrations run, reimbursement user exists for logged-in user. |
| Empty OKR page | Same as above; run `/api/seed/crm-okr` to add sample goals. |
| No sample data | Call `POST /api/seed/crm-okr` with `SEED_SECRET` (or `CRON_SECRET`). |
