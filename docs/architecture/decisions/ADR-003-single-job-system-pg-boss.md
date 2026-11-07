# ADR-003: pg-boss is the only execution substrate for engage (journeys, sends, ingestion fan-out)

- **Status:** Accepted (2026-11-07, with D-01)
- **Context:** Four job mechanisms coexist (BullMQ, pg-boss, node-cron, setInterval) with no shared idempotency. Journeys need durable, exactly-once-effect execution tied to DB state.
- **Decision:** All engage async work runs on pg-boss (v12, already a dependency):
  - Enqueue happens in the **same transaction** as the state change (event insert, enrollment creation, step completion).
  - `singletonKey` / unique step-run rows give per-step idempotency. Delays use `startAfter`.
  - Dead-letter queue + admin replay endpoint.
  - Scheduled work (partition creation, İYS sync, timeouts) uses pg-boss `schedule`, not node-cron.
  - pg-boss connects with a direct (non-transaction-pooler) URL (`PG_BOSS_DATABASE_URL`).
  - BullMQ, node-cron and setInterval remain for frozen Company-OS features only. No new usage.
- **Consequences:** + no Redis needed for correctness; one place to inspect jobs; transactional semantics. − pg-boss load lands on the primary DB; fine for pilot scale (hundreds of thousands of jobs/day). Revisit above ~1M sends/day.
- **Rejected:** BullMQ (Redis state cannot commit atomically with Postgres state, risking lost or ghost jobs); Temporal (operational weight for a solo founder); a custom poller.
