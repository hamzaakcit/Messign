# Marketing module — production checklist (pre-deploy)

Use this before shipping **Phase 4** (operations + finance boundary) and **Phase 5** (publisher + cron).

## 1. Build & tests (local / CI)

```bash
cd messign-workspace
npm run build
cd server && npm run type-check
cd server && npx vitest run src/__tests__/modules/marketing/
```

- **Phase 4 matrix:** `campaignOperations.test.ts` — OP-01…OP-04 (mocked DB; must pass).
- **Phase 5 matrix:** `publisherExecution.test.ts` — EX-01…EX-03 require **PostgreSQL** with migrations **075+** (`marketing_content_calendar`). If the table is missing, tests **skip** with a warning; for full CI coverage, run against a migrated DB:

```bash
DATABASE_URL="postgresql://..." npx vitest run src/__tests__/modules/marketing/publisherExecution.test.ts
```

## 2. Database migrations (production)

Apply migrations **through 078** on the **production** Postgres (Railway / Render / etc.):

| Migration | Purpose |
|-----------|---------|
| `075_marketing_calendar_budget.sql` | `marketing_content_calendar`, `marketing_budget_allocations`, campaign objective |
| `076_marketing_publisher_calendar.sql` | Publisher columns: `published_url`, `last_error`, `external_post_id`; status includes `processing` |
| `077_marketing_content_user_brief_revision.sql` | Content revision fields |
| `078_marketing_calendar_paused_finance_stub.sql` | Calendar `paused` status; `finance_marketing_journal_stub` for budget ↔ finance sync |

From `server/` (with `DATABASE_URL` pointing at production):

```bash
npm run db:migrate-runner
```

(Use your project’s standard migration runner; if you use `db/migrations` RLS separately, see `db:apply-rls` in the root `package.json`.)

**Verify:**

```sql
SELECT to_regclass('public.marketing_content_calendar');
SELECT to_regclass('public.finance_marketing_journal_stub');
```

## 3. Environment variables

| Variable | When |
|----------|------|
| `DATABASE_URL` | Required |
| `JWT_SECRET` (or `JWT_ACCESS_SECRET`) | Required |
| `MARKETING_PUBLISHER_ENABLED` | `0` to disable the publisher cron; omit or non-`0` to enable (default) |
| `MARKETING_PUBLISHER_TZ` | Optional; default UTC |
| LinkedIn / email real sends | `LINKEDIN_ACCESS_TOKEN`, `RESEND_API_KEY` / `SENDGRID_API_KEY`, etc. — only if not using adapter mocks |

## 4. Optional full-platform gate

```bash
cd server && npm run launch:check
```

Requires Redis, seeded data, and admin user — run **after** production DB is migrated and seeded.

## 5. Deploy (this repo)

- **Frontend (Vercel):** push to `main` triggers [`deploy.yml`](../../.github/workflows/deploy.yml) if `VERCEL_DEPLOY_HOOK` is configured in GitHub secrets.
- **Backend (Railway / Render):** root directory `server` — `npm install && npm run build` → `npm run start`. Set `PORT` + env vars above.

## 6. Post-deploy smoke

- Marketing hub: campaigns, content, calendar (if applicable).
- Schedule approved content → row `scheduled` → after cron tick → `published` or `failed` with `last_error`.
- Budget allocate (confirmed) → row in `marketing_budget_allocations` + line in `finance_marketing_journal_stub` (same transaction).
