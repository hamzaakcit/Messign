# Pilot runbook (WP-33)

For Messign's operator during a pilot (today: the founder, alone). It ties together the runbooks that already exist and adds what a pilot needs: who is on call, how to stop sending and how fast, key rotation, incidents, and the kill-switch drill. Read it once before business start, and do the drill before the first real message.

Related: `release-and-rollback.md` (deploys, rollback, backups), `ops-monitoring.md` (alerts, restore drill), `send-a-campaign.md`, `ses-sandbox-setup.md`, `whatsapp.md`, `iys-sync.md`, `docs/onboarding/` (the tenant kit and the checklist), `docs/compliance/tr-messaging-obligations.md`.

This is an operational document. It makes no compliance claim; what a tenant must tell a regulator, a customer or İYS is the tenant's and counsel's call **[LC]**.

## 1. On call

| | |
|---|---|
| Who | The founder. One person, so the single points of failure are listed below, not hidden |
| When | The pilot's send windows (agree them with the tenant in the pilot terms) plus the hour after each. Outside them, alerts are read in the morning; nothing sends outside a window unless a journey is running |
| How you are told | `ENGAGE_ALERT_WEBHOOK_URL` (chat) and `ENGAGE_OPS_HEARTBEAT_URL` (a dead-man URL: it is the only thing that tells you the ops check itself stopped). Prove both with `npm run engage:ops-drill -- --send-test --heartbeat` before the pilot |
| The tenant's contact | One named person at the tenant, with a phone number, agreed at kickoff: they can also press **Turn sending off** themselves |
| Do not do alone at midnight | Anything irreversible: a migration, a master-key rotation, deleting data. Stop sending first, fix in the morning |

Single points of failure today: one person; the master key (section 4); the Railway project; the tenant's own ESP and WhatsApp accounts. Write down who else could press the switch if you cannot (a trusted second person with Railway access, or the tenant's admin for their own switch).

## 2. Stopping sending: the two switches

| Switch | What it does | How | How fast |
|---|---|---|---|
| **Per tenant** | The tenant's messages are held (`tenant_send_disabled`), nothing reaches a provider, nothing is lost: the messages wait and go out once when it is switched back on, unless they expire first (default 24 hours; WhatsApp templates 3 days) | The tenant admin: Settings > Sending > **Turn sending off**. Operator, from their own terminal with the admin database URL: `UPDATE engage.tenant_settings SET send_enabled = false, updated_at = now() WHERE organization_id = '<org uuid>';` | The gate reads the flag again for **every** message: the very next message is held. Measured in the drill (section 6): milliseconds on the sandbox; the bound in production is one message already in flight plus the dispatcher's tick (one minute) |
| **Global** | Every tenant's messages are held (`send_mode_off`) and the dispatcher reads nothing | Railway: the server service > Variables > `SEND_MODE` = `off` > Deploy (a variable change redeploys the server) | As long as the new deployment takes to start answering, and the old one to stop. **Not measured until you run the stopwatch drill** (section 6): record it in `docs/quality/kill-switch-drill-wp33.md` |

Which to use: with one pilot tenant the per-tenant switch is the fast one; use it first, then set the global switch as the second layer. Global is for "something is wrong with Messign itself" (a gate bug, a leaked key, a wrong deploy), the tenant switch for "something is wrong with this tenant's sending".

After stopping, verify, do not assume: Settings shows "Sending is off" (or "Server mode: off"), and `npm run engage:ops-report -- --org <uuid>` shows no messages leaving. To resume: reverse the switch, wait for the next tick, and check the held messages went out once each (the trail of a customer shows the decision).

Paused marketing messages are not a legal remedy by themselves; whether a message that went out must be corrected or reported is for the tenant and counsel **[LC]**.

## 3. Rollback

`release-and-rollback.md` has the steps (Railway redeploy of the last good deployment, Vercel promote, `git revert -m 1`, forward migrations only). Pilot rules on top:

- **No deploys during a send window.** Deploy after the hour that follows it. A deploy restarts the dispatcher; messages are not lost, they wait in the queue.
- Before any deploy that touches `engage/messaging`, `engage/journeys` or a migration: run the full test suite, the E2E (`npm run engage:e2e`) and the post-deploy smoke (`scripts/smoke-production.sh <api url>`).
- If a deploy is bad while sending is on: **stop sending first** (section 2), then roll back, then resume. Rolling back does not undo sends.
- Migrations are applied by you with `npm run db:migrate` and are additive: old code keeps working against the new schema. Never roll one back in a hurry.

## 4. Key and credential rotation

| Secret | Rotate when | How | Effect |
|---|---|---|---|
| **A tenant's channel account** (ESP key, WhatsApp token, İYS password) | The tenant rotates it, an employee leaves, a leak is suspected | The new secret typed at a hidden prompt: `npm run engage:add-account` for a new account, or `POST /api/engage/channel-accounts/:id/rotate` as the tenant admin. The webhook URL keeps working after a rotation | The old secret stops being used at once. Revoke the old one at the provider too |
| **`ENGAGE_MASTER_KEY`** (encrypts every tenant's credentials) | Yearly, on a leak, when someone with access leaves | 1. Generate a new 64-hex key and a new id (`k2`) **in a password manager first**. 2. In Railway set `ENGAGE_MASTER_KEY`, `ENGAGE_MASTER_KEY_ID=k2` and `ENGAGE_MASTER_KEYS_OLD=k1:<old hex>`; deploy. 3. From `server/`, with the production database URLs and the same variables, run `npm run engage:rewrap-keys`. 4. Check it says all credentials were re-wrapped, then remove `ENGAGE_MASTER_KEYS_OLD` and deploy. 5. Keep the old key in the password manager until a backup older than the rotation is gone | Losing the key makes every stored credential unrecoverable; never rotate without a copy of both keys outside Railway. Not yet drilled on production: rehearse it on a scratch database first |
| **`ENGAGE_ALERT_WEBHOOK_URL`, `ENGAGE_OPS_HEARTBEAT_URL`** | A chat channel changes, a leak | Edit the Railway variable; run `npm run engage:ops-drill -- --send-test --heartbeat` | Alerts follow the new channel |
| **Webhook verify tokens and signing secrets** (WhatsApp, mock, SES topic) | A leak | Rotate the account with the new value, then set the same value at the provider | Reports with the old secret are refused |
| **The tenant admin's password** | At first login; on request | The login flow; an operator never sets or sees a tenant's password | |
| **`DATABASE_ADMIN_URL`, `ENGAGE_DATABASE_URL`** | A leak, an employee leaves | Railway Postgres: rotate the role's password, update the variables, redeploy | Server cannot reach the database until both match |

In a suspected leak of any key: stop sending (section 2), rotate, review the audit trail of that tenant (customer trail and `engage.send_decisions`), tell the tenant. The notice duties after a personal-data incident are the tenant's and Messign's **[LC]**.

## 4b. Single-person risks to close before business start

- The master key and every Railway login are in a password manager with an emergency contact (not in the repository, not in chat).
- The restore drill (`ops-monitoring.md`) has been run against **Railway's own backups**; today it has only been run on a local copy.
- The alert webhook and heartbeat are set and proven.

## 5. Incidents

First five minutes, whatever the incident: **stop sending** for the affected tenant (section 2); note the time; do not delete anything.

| Incident | Signs | First steps |
|---|---|---|
| A message went out that the gate should have stopped (no consent, a suppressed address, outside quiet hours) | A customer complaint, or the trail shows `allow` without a consent record | Stop globally. This is a **pilot stop** (below). Capture the message id, the decision row and the consent record; do not fix before you understand; add the case to the adversarial suite |
| Spam complaints or unsubscribes above the guardrail | `complaint_rate_high`, `bounce_rate_high`, unsubscribe rate above 1% for a send | Stop the campaign (tenant switch), look at how the audience's consents were collected, and talk to the tenant before resuming |
| Provider outage or key refused | `provider_failing`, `credentials_rejected` | Messages retry by themselves for transient codes; for a refused key rotate the account (section 4). Do not switch to another provider on your own |
| Delivery reports missing | `delivery_reports_missing` | `ops-monitoring.md`: the webhook, the signing secret, the SNS or Meta subscription |
| Cross-tenant data access suspected | Any report of one tenant seeing another's data | **Pilot stop.** Stop globally; keep the evidence; run `engageIsolation` and `engageTenantGuard` against the deployed commit; tell both tenants. Legal duties **[LC]** |
| A bad deploy | Smoke fails, errors burst | Stop sending, roll back (section 3), resume |
| The server or database is down | Heartbeat silent, health fails | Nothing sends while the server is down; check Railway status; after recovery, check messages that were `sending` at the crash: a message the provider accepted but Messign did not record can only be deduplicated by a provider that honours the idempotency key (adapter contract) |
| The founder is unavailable | | The second person (section 1) presses the switch; the tenant's admin presses theirs |

**Pilot stops** (from the default pilot design, D-08): unsubscribe rate over 1% per send; spam-complaint rate over 0.1%; any send outside the gate; any cross-tenant data access. A pilot stop means stop, write what happened, and agree restart conditions with the tenant in writing.

After each incident, append a dated entry to `docs/roadmap/weekly-progress.md` (what, when, how long, what changed) and, for a gate or isolation miss, a test.

## 6. The kill-switch drill

Pilot gate 6 needs both switches drilled with a timed result. Two parts: the in-process drill (a script, with a pass or fail and milliseconds) and the stopwatch for the part only the real server can show (Railway).

### 6a. The drill script

It needs a **drill tenant** (never a customer's), with one active email account of provider `mock` in mode `test`, a sender name and rate card, a budget cap, and `ENGAGE_PUBLIC_APP_URL` / `ENGAGE_PUBLIC_API_URL` set in your terminal's environment. The script refuses any other account. It forces `SEND_MODE=sandbox` in its own process and sends only through the mock adapter to `@example.com` addresses: nothing real can leave. It writes 16 profiles and messages on the drill tenant and removes its allow-list entries at the end.

One-time set-up of a drill tenant (operator terminal, from `server/`, with the environment of the database you are drilling):

```bash
npm run engage:provision -- --name "Drill" --slug drill --admin-email you@example.com --admin-name "Drill Admin"
npm run engage:add-account -- --org <drill org uuid> --channel email --provider mock --mode test --label "Drill mock" --secret webhook_secret --ask-master-key
```

Then in the app as the drill tenant's admin: rate cards (marketing and transactional, email) and a monthly budget cap; the Sending card should list nothing missing except the switch. Run the drill:

```bash
npm run engage:kill-switch-drill -- --org <drill org uuid> --account <the mock account id> --ask-master-key
```

It prints PASS or FAIL for: preconditions; baseline (3 messages sent); **global switch** (the next message after `SEND_MODE=off` is held, with the milliseconds; the rest of the batch held; nothing left the queue); **tenant switch** (the write, then the next message held, with the milliseconds; the rest held; nothing left); **switching back** (every held message went out, exactly one `sent` event each). Exit code 0 only if everything passed. `--json` prints the same as JSON. It restores the tenant's original switch at the end.

**Not run for this work package against Railway, a development or any production database.** The drill is for you to run in your own terminal against the environment you want to prove; the repository holds the script, its test and a scratch-database result (`docs/quality/kill-switch-drill-wp33.md`).

### 6b. The stopwatch (the real server)

The global switch on Railway is a variable change and a redeploy; the script cannot flip it. Time it by hand:

```bash
npm run engage:kill-switch-drill -- --stopwatch global
npm run engage:kill-switch-drill -- --stopwatch tenant
```

Global: press Enter the moment you press Deploy on `SEND_MODE=off`; reload Settings (as the drill tenant's admin) and press Enter when it says "Server mode: off". Then set it back and time that too. Tenant: Enter when you press **Turn sending off**, Enter when the card says it is off. For a stronger check, queue messages first (a campaign to the drill tenant's staff allow-list in sandbox) and note whether any left after the time you pressed.

### 6c. Record it

Fill in the table at the bottom of `docs/quality/kill-switch-drill-wp33.md` (date, environment, commit, the numbers, who ran it) and add one line to `weekly-progress.md`. Repeat the drill: before the first real message of a pilot; after any change to the gate, the dispatcher or the Settings switch; after a change of hosting; and at least quarterly.
