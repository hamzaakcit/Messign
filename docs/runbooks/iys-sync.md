# Runbook: İYS sync (WP-26, ADR-022)

What it does: a tenant's opt-outs are reported to İYS (within three business days, ours same day), and what recipients do in İYS (revoke or grant) is pulled into the consent ledger, so the send gate sees it before the next send. It uses the **tenant's own** İYS API access. Messign is not an İYS integrator.

## Connect a tenant (business start)

1. **The tenant** (Hesap Sahibi or Hesap Yöneticisi) signs in to İYS Web with e-Devlet and creates an API **test** account and, when the contract is done, a **live** account. İYS gives an API user name and password, and the tenant has an İYS number (`iysCode`) and a brand number (`brandCode`). The documentation says live access is only for providers who completed the contract, and speaks of an IP whitelist: **ask İYS how to register this server's outbound address** for the tenant, and note that İYS's limits (10 requests a second, 100 history listings an hour, 100 token requests an hour) count per address, shared by every tenant on this server.
2. **Start in İYS's sandbox** (provider `iys`, mode `test`). Never put real recipients in the sandbox: İYS says it is for integration only.
3. **Create the account** through the API, not the browser (the password is a secret), as a tenant admin:
   `POST /api/engage/channel-accounts` with `{"channel":"iys","provider":"iys","mode":"test","label":"iys","config":{"iys_code":<number>,"brand_code":<number>},"secrets":{"username":"…","password":"…"}}`. One active İYS account per tenant; rotate with the usual rotate call.
4. **Check it:** `POST /api/engage/settings/iys/check` (admin). `ok: true` means a token was issued and the brand number is in İYS's list. Otherwise the answer names İYS's code (`H251` wrong user or password, `brand_not_found`, `unreachable`, …).
5. **First live verification (do this before relying on it):** with the sandbox account, record a test opt-out for a test address that İYS holds as ONAY, run the sync, and check in İYS's sandbox that the RET is there with the source we sent; revoke in the sandbox and check that the next pull applies it. The mock is built from the documentation and can differ from İYS: compare, and fix `engage/iys/mock` and the code together. Confirm with İYS and the tenant's legal advisor that the **source values we report** (`HS_EPOSTA` for an unsubscribe link, `HS_MESAJ` for STOP, `HS_WEB`, `HS_EORTAM` for API and import) are the right ones.
6. **Switch to live** by creating a second account with mode `live` (disable the test one first: one active account at a time).

## Watch it

`GET /api/engage/settings/iys` (admin): the active account (never its credentials) and the report.

| Report field | Meaning |
|---|---|
| `health` | `ok`, `warning` (something late, rejected or stale) or `critical` (a breach, a missed deadline, a pull not succeeding for over 72 hours) |
| `push.pending` / `late` / `atRisk` / `breached` | opt-outs not yet reported: over 24 hours, from two business days, past three |
| `push.failed`, `push.deadlineMissed` | reports İYS refused, and reports that waited past the deadline |
| `pull.status` | `ok` (succeeded within 2 hours), `stale`, `critical`, `never` |
| `pull.lastOutcome`, `lastErrorCode` | the last attempt and İYS's code |

Logs carry tenant ids, counts, İYS's error codes and `X-Trace-Id`s, never an address. When asking İYS for support, give them the trace id, the time, the URL and this server's address (not the password or token).

## When it is not ok

- **Pull `stale` or `critical`:** İYS lists only the last **7 days**; a pull that fails for longer than that loses recipients' opt-outs for good. Read `lastErrorCode`: `H251` or 401 (credentials: rotate the account), `H089` (history limit: wait an hour, do not retry), `unreachable` or 5xx (İYS: retry is automatic). Fix before the third day.
- **Reports `late` or `at_risk`:** read `last_error_code` on the queue rows (`engage.iys_outbox`). `H453` waits six hours by design; `H251`/401 means credentials; 5xx means İYS. A report past three business days is `deadline_missed`: İYS refuses it (H467); record why and tell the tenant.
- **A report `failed / rejected`:** İYS refused the request itself (for example `H121`, a phone number İYS cannot take); the code is on the row.
- **`skipped`:** `not_in_iys` (İYS never held a consent for the address), `superseded` (İYS holds a newer decision), `historical` (an imported opt-out older than three business days when queued), `recipient_unavailable` (no address). None is a breach.

## Develop without İYS

`npm run engage:iys-mock -- --port 4010` starts the mock İYS on the loopback address. Run the API server with `ENGAGE_IYS_MOCK_URL=http://127.0.0.1:4010` and create an account with provider `mock`, `iys_code` 100001, `brand_code` 100001, user `mock-user`, password `mock-password` (fixed mock values, not secrets). The mock keeps its state in memory only.
