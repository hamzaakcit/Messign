# One Lucy page for Company-OS and engage (ADR-016)

The Marketing page (`/marketing`) is one page. For the platform organization (Messign) it is the Company-OS Lucy page with the engage sections on it: tabs **Lucy, Customers, Journeys, Segments, Templates**, the engage tiles next to Lucy's, and panels for records and editors. This runbook turns it on and off.

## What each user sees

| Deployment (`PRODUCT_SURFACE`) | Who | `/marketing` |
|---|---|---|
| `engage` | a tenant | the engage page (no Lucy chat) |
| `workspace` | a Messign user | the Lucy page as before (engage is not mounted) |
| `all` | the platform organization, engage enabled | the Lucy page with the engage sections |
| `all` | the platform organization, not enabled | the Lucy page as before |
| `all` | a tenant | the engage page (never the Lucy chat or tools) |

On the `all` surface a tenant is refused every Company-OS route at the server and shown the engage pages only (ADR-017), so a tenant may sign in on either kind of deployment.

## Turn it on locally

1. `server/.env`: `PRODUCT_SURFACE=all`. It also needs `ENGAGE_DATABASE_URL`, `ENGAGE_MASTER_KEY` and `ENGAGE_MASTER_KEY_ID` (already set for engage work).
2. `client/.env.local`: `VITE_PRODUCT_SURFACE=all`.
3. Apply the migrations (the engage ones go up to 126) and enable the platform organization, from `server/`:
   ```bash
   npm run db:migrate
   npm run engage:platform
   ```
4. Restart the server and the client, sign in as a Messign user, open **Marketing**.

The command prints the platform organization and its product (`all`). Run it again: it says it already was.

## Turn it off

```bash
npm run engage:platform -- --off
```

The organization goes back to `workspace`. Its engage data stays in the database but becomes unreachable, as for any organization that is not a tenant.

## Production

1. Apply migration 126 with the usual migrate. It only widens the allowed values; no organization changes.
2. Only if that deployment runs `PRODUCT_SURFACE=all` (the engage API must be mounted): run `npm run engage:platform` with `DATABASE_ADMIN_URL` set. Nothing else enables it.
3. Sending from the platform organization needs a channel account and readiness like any tenant (`npm run engage:add-account`), and `SEND_MODE` stays the master switch.

## Rules the command enforces

- Only the organization named by `PLATFORM_ORG_SLUG` (default `messign`) can be changed.
- An engage tenant is refused, and so is an organization that does not exist.
- It creates the engage settings row with sending disabled; it never enables sending.
