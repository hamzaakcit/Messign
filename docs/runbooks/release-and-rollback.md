# Release, rollback and recovery runbook

For the person on call (today: the founder). Short on purpose. Anything marked **unverified** has not been tried
yet and should be drilled once before it is relied on.

## How a change reaches production

1. Open a PR. CI must pass: **Type-check & test** (unit tests plus real-Postgres suites) and **Production build**
   (builds the server and client exactly as production does).
2. Merge to `main`. Two deploys start by themselves:
   - **Railway** builds the API with `railway.json` (`npm install --include=dev && npm run build:server`) and starts
     `node dist/index.js`. It reports its result as a commit status named `<project> - server`.
   - **Vercel** builds the client.
3. **Post-deploy smoke** (GitHub Actions) reacts to Railway's status. If the deploy **failed** it fails and GitHub
   emails you; if it **succeeded** it runs `scripts/smoke-production.sh` against the live API.

A failed Railway build is silent otherwise: the previous version keeps running and nothing looks wrong.

## Is production OK right now?

```bash
scripts/smoke-production.sh https://server-production-7283.up.railway.app
```

Read-only, no credentials. Exit code 0 means every check passed. Add `--no-engage` if engage is deliberately off.
You can also run it from GitHub: **Actions → Post-deploy smoke → Run workflow**.

## Database migrations

- Schema changes are files in `server/src/migrations/NNN_name.sql`, applied with `npm run db:migrate` (see ADR-010).
- **Migrations are not applied by a deploy.** Run `npm run db:migrate` against production yourself, using the admin
  URL (`DATABASE_ADMIN_URL` / the public Postgres URL), **before or right after** merging code that needs it.
- They are additive on purpose, so old code keeps working against the new schema. Apply the migration first, then
  deploy the code that uses it.
- The runner records what it applied in `schema_migrations`, takes an advisory lock, and rolls a failing migration back.

## Rollback

**Code (Railway):** Railway dashboard → the API service → **Deployments** → open the last good deployment →
**Redeploy**. This reverts code only. Variables are not part of a deployment: a variable change is reverted by editing
the variable.
**Frontend (Vercel):** Vercel project → **Deployments** → the last good one → **Promote to Production**.
**Git:** revert the merge on `main` with a new PR (`git revert -m 1 <merge commit>`); do not rewrite history.

**Database (unverified).** Do not roll a migration back by hand in a hurry. The engage migrations (111, 112) only add
objects, so leaving them in place is safe. If one truly must go, the undo for 112 is:
`DROP TABLE engage.channel_accounts;` and `DELETE FROM schema_migrations WHERE filename = '112_engage_channel_accounts.sql';`
(that deletes tenants' stored credentials, so only before any exist). Prefer a new forward migration.

## Backups and restore (unverified)

Nobody has restored a backup yet, so treat backups as unproven.

1. In Railway, open the Postgres service and check whether **backups** are enabled and how recent the last one is.
2. Drill a restore **once**, into a throwaway database, never over production: restore the latest backup, run
   `npm run db:migrate` against it (it should report the baseline matches), then run the engage tests against it.
3. Write down how long it took and what you did, and replace this section with the real steps.

## Secrets that must be backed up outside Railway

- `ENGAGE_MASTER_KEY` (and any `ENGAGE_MASTER_KEYS_OLD`): losing it makes every stored tenant credential unrecoverable.
  Keep it in a password manager.

## Variables that change behavior

| Variable | Effect |
|---|---|
| `PRODUCT_SURFACE` | `workspace` (default), `engage`, or `all`. Engage mounts only for `engage` or `all`. |
| `ENGAGE_DATABASE_URL` | Full connection string for the **`messign_engage`** role. Must not be the `postgres` superuser. |
| `ENGAGE_MASTER_KEY`, `ENGAGE_MASTER_KEY_ID` | 64 hex characters, and its id (`k1`). Required in production for engage to mount. |
| `SEND_MODE` | `live` makes the legacy marketing adapters send for real. Anything else mocks. |
| `MARKETING_PUBLISHER_ENABLED` | `1` starts the minute-by-minute publisher. With `SEND_MODE` not `live` it only marks posts published. |

## Known failures

| Symptom | Cause | Fix |
|---|---|---|
| Railway deploy fails with `TS2688 … vitest/globals` | Build env skipped dev dependencies | Already prevented by `--include=dev` in `railway.json`; the **Production build** CI job guards it |
| Variable change has no effect | The redeploy built the old failing commit, or the change is staged and not deployed | Check the newest deployment's status; click Deploy on staged changes |
| `[engage] NOT mounted: … ENGAGE_DATABASE_URL must be a full connection string` | Variable is not a full URL | Set the whole `postgresql://messign_engage:…@postgres.railway.internal:5432/railway` |
| `[engage] NOT mounted: … role "postgres" has SUPERUSER or BYPASSRLS` | Variable points at the superuser | Use the `messign_engage` user (the check is working as designed) |
| `[engage] NOT mounted: … ENGAGE_MASTER_KEY …` | Missing or malformed key | 64 hex characters, no quotes or spaces |
| `[engage] NOT mounted: … ECONNREFUSED` | Wrong host or port | Internal host `postgres.railway.internal`, port `5432` |
| Smoke check "Seed routes are not exposed" fails | Seed routes mounted in production | Check `NODE_ENV=production` and the deployed commit |
| Smoke check "Forged X-User-Id" fails | A header-auth bypass is back | Treat as a security incident: roll back first, then investigate |

## Where to look

- Railway: API service → Deployments → logs. The first `[engage]` line says whether engage mounted and why not.
- GitHub: Actions tab (CI, Post-deploy smoke). The `main` commit page lists Railway's and Vercel's statuses.
