# ADR-007: Journeys trigger from persisted events, never from the in-process mitt bus

- **Status:** Accepted (2026-11-07, with D-01)
- **Context:** A10 refuted: the mitt bus is in-process, synchronous, swallows errors, and loses events on restart or with multiple replicas.
- **Decision:** Ingested events are committed to `engage.events` together with a pg-boss trigger-evaluation job in one transaction. Journey triggers, waiters and exit checks read from the database. The mitt bus may still be used for UI/socket notifications about engage activity (best effort), never for correctness.
- **Consequences:** + no lost triggers; replayable. − slightly higher latency (job pickup interval, ~1–2s), acceptable for marketing journeys.
- **Rejected:** Redis pub/sub swap of the bus (still not durable); Kafka (operational weight).
