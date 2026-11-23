# Ops monitoring runbook (WP-29, ADR-024)

## Set up (once, on the server)
| Variable | What | Needed |
|---|---|---|
| `ENGAGE_ALERT_WEBHOOK_URL` | An incoming-webhook URL of the chat the operators watch (Slack, Mattermost, Discord and similar). A secret: set it in Railway, never in the repository or in a chat. https only | Yes: without it alerts are stored and shown to tenants but nobody is told |
| `ENGAGE_OPS_HEARTBEAT_URL` | A dead-man URL (any service that alerts when its URL is not called for 15 minutes); pinged after each clean run of the ops check | Recommended: it is the only thing that tells you the ops check itself stopped |
| `ENGAGE_OPS_*` | Thresholds, for example `ENGAGE_OPS_FAIL_RATE_WARNING=0.3`, `ENGAGE_OPS_MIN_ATTEMPTS=20`. The names are the keys of `ops/thresholds.ts` in upper snake case. An invalid value is ignored | No |

The job `engage/ops-check` runs every five minutes once the server has its job queue. Apply migration 136 first (`npm run db:migrate`).

## Prove the channel works (the alert drill)
```bash
npm run engage:ops-drill -- --send-test --heartbeat
```
Posts one message that says it is a drill to the operators' channel, and pings the heartbeat. Do this after setting the variables, and after any change of channel. The URLs are never printed.

## Look now
```bash
npm run engage:ops-report              # every tenant that can be sending
npm run engage:ops-report -- --org <org uuid> --json
```
Read-only: prints what the rules find at this moment. Nothing is stored or sent.

## What an alert means and what to do
Tenants appear in the operators' message by the first eight characters of their organization id (the engage role cannot read organization names); `npm run engage:ops-report -- --org <full id>` takes the full id.

| Alert | Meaning | First step |
|---|---|---|
| `provider_failing` | At least a quarter of the provider calls in 15 minutes failed | Read the codes in the message; check the provider's status page; transient codes retry by themselves |
| `credentials_rejected` | The provider refused the account's key or token several times | Rotate the account (`POST /channel-accounts/:id/rotate`); the webhook URL keeps working after a rotation |
| `delivery_reports_missing` | Messages were accepted but no report has come back for 24 hours | The webhook is not reaching Messign: the provider's callback URL, its signing secret, and for WhatsApp the app's subscription to the WhatsApp Business Account (`docs/runbooks/whatsapp.md` step 3b); for SES the SNS subscription |
| `bounce_rate_high` / `complaint_rate_high` | Email reputation is at risk | Stop the campaign, clean the list, check how the addresses were collected |
| `gate_denials_systemic` | The gate refuses sends because the setup is wrong (no price, no budget, sender name mismatch, account inactive, …) | The code names it; the tenant's Settings screen shows the same text |
| `gate_denials_spike` | Far more refusals than usual for an ordinary reason (consent, suppression) | Look at the latest campaign's audience |
| `messages_stuck` | Messages are past their send time, or stuck while sending, while sending is on | The journey tick (it dispatches) is not running: look for a dead `engage/journey-tick`, and for gate holds such as `gate_unavailable` in the log |
| `trigger_outbox_stuck` | Events are not starting journeys | The same job; failed rows need a look |
| `email_domain_lost`, `iys_sync` | The tenant's own attention items (ADR-020, ADR-022) | Their Settings cards say what to do |
| `job_failed:<queue>` (platform) | Jobs of an engage queue used up their retries in the last 24 hours | `SELECT * FROM pgboss.job WHERE name = '<queue>' AND state = 'failed' ORDER BY completed_on DESC` and read `output` |
| `new error` / `error burst` (platform) | Engage code logged an error nobody has seen, or the same one many times | The line carries the source and a fingerprint; search the server log for `error captured` and the fingerprint |

Alerts are told when they open, when they become critical, as a reminder (critical every 6 hours, warning daily), and once when they resolve. A tenant admin sees their own open alerts under "Needs attention" and each account's state on the "Delivery health" card of Settings.

## Restore drill (do this before real data, then every quarter, and after any change of hosting)
A backup is proven only by restoring it. The drill needs a scratch database, never the live one.

1. On the live database, record what it holds (read-only):
   ```bash
   RESTORE_CHECK_DATABASE_URL=<live url> npm run engage:restore-check -- --manifest-out live.json
   ```
2. Take the backup (Railway backup, or `pg_dump -Fc`) and restore it into an empty scratch database (`pg_restore --no-owner -d <scratch>` for a dump; for a provider snapshot, restore it into a new instance).
3. Roles are not part of a dump: make sure the application's role `messign_engage` exists on the scratch server with its grants (`engage:provision` and the migrations do this on a normal setup). The check reports it if not.
4. Check the restored database as its owner or a superuser (forced row-level security would show any other role nothing):
   ```bash
   RESTORE_CHECK_DATABASE_URL=<scratch url> npm run engage:restore-check -- --manifest live.json
   ```
   Every line must say PASS. `counts` also says how many rows were written after the restore point. Exit code 1 if any check fails.
5. Record the date, the size, the restore time and the result in `docs/roadmap/weekly-progress.md`.

The connection strings are read from the environment, never from arguments, and nothing the check prints is customer data.

**Last drill:** 2026-11-23, local PostgreSQL 17: `pg_dump -Fc` of a 470 MB database (1.0M consents, 2.3M events) took 30 seconds; `pg_restore` 1 minute 50; all ten checks passed, counts identical to the live manifest. **Not yet run against Railway's backups**: that needs an operator with access to the Railway project (D-17 lists it with the hosting decision).
