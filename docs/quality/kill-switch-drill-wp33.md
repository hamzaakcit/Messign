# Kill-switch drill record (WP-33, pilot gate 6)

How to run the drill: `docs/runbooks/pilot-runbook.md` section 6. Script: `npm run engage:kill-switch-drill` (`server/src/scripts/engageKillSwitchDrill.ts`, logic in `server/src/engage/ops/killSwitchDrill.ts`). Test: `engageKillSwitchDrill.integration.test.ts`.

**Read this first.** The drill in the table below ran on a **scratch PostgreSQL 17 on the development machine** (port 5499, a database made for tests). It was **not run against Railway, the development database or any production database**: that is for the operator, in their own terminal, with the command in the runbook. The Railway rows are empty on purpose. The pilot gate "kill switch drilled (global and per-tenant) with a timed result" is evidenced here for the code and the database mechanism, and is **open for the real environment** until the Railway rows are filled.

## What the drill proves, and what it does not

| Proves | Does not prove |
|---|---|
| With a batch of messages running, `SEND_MODE=off` holds the very next message (`send_mode_off`) and nothing leaves the queue | That Railway's `SEND_MODE` change takes effect at any given speed: the script flips its own process's variable. The Railway time is the stopwatch part (`--stopwatch global`) |
| `send_enabled=false`, written through the same code as the Settings screen, holds the very next message (`tenant_send_disabled`), and the tenant's other state is untouched | That a person pressed a button in a browser (the E2E report covers the HTTP route: `engageSandboxE2E`) |
| Switching back sends every held message once each (16 of 16 messages, exactly one `sent` event each) | Behaviour of a real provider: the drill uses the mock adapter and `@example.com` addresses; nothing real is sent |
| The drill leaves the tenant's switch and `SEND_MODE` as it found them, and removes its allow-list entries | The dispatcher's own tick (up to one minute) in a running server: the bound in production is one message in flight plus that tick (`target-state.md`) |

## Scratch result (2026-11-23)

Environment: scratch PostgreSQL 17, local; commit of the WP-33 branch on top of `9a1b6cc7` (WP-30); drill tenant with a mock email account, sender name equal to the From name, rate cards, budget cap; sending was off before each run and off after it. Five runs of the real script, all PASS:

| Measurement | Result (5 runs) |
|---|---|
| Global: the next message after `SEND_MODE=off` is held | 0.01 ms (all five runs) |
| Tenant: the write of `send_enabled=false` | 0.73 to 0.87 ms |
| Tenant: the next message held, counted from the start of the write | 1.73 to 2.07 ms |
| Messages after the flip that reached the adapter | 0 (the four held messages of each switch stayed `queued`) |
| Messages sent after switching back | 16 of 16, one `sent` event each |

These are in-process times on a local database. They show the mechanism is a per-message read, not that production is that fast: the production figure is the rows below.

**Does the drill have teeth?** Run against broken code: (1) the gate no longer reads the tenant switch: the drill FAILED at "tenant switch: the next message after the write is held" and its batch check; (2) both global-switch checks removed (the dispatcher's and the gate's): FAILED at the global step (a third layer still held the message with `gate_unavailable`, a different code, so the drill reports the difference); restored: PASS.

## The real environment (for Hamza; not run here)

Fill in one row per run. Run it in your own terminal, against the environment you are proving, on a drill tenant (never a customer's).

| Date | Environment (Railway pilot / dev) | Commit deployed | Global switch: Deploy pressed to "Server mode: off" seen (stopwatch) | Resume time (same measure) | Tenant switch: press to "Sending is off" (stopwatch) | Script result (PASS/FAIL, tenant held ms) | Who |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

Suggested order: (1) one-time set-up of the drill tenant (runbook 6a); (2) `npm run engage:kill-switch-drill -- --org <uuid> --account <id> --ask-master-key`; (3) `-- --stopwatch global` while changing `SEND_MODE` in Railway and back; (4) `-- --stopwatch tenant`; (5) write the row and one line in `weekly-progress.md`.
