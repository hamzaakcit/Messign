# ADR-008: BYO messaging accounts; cost ledger + budget caps instead of wallet/spread

- **Status:** Accepted (2026-11-07, D-02 approved)
- **Context:** The tenant owns the Alaris/ESP/WABA accounts. Messign has no entity, no reseller contract and no confirmed İYS/BTK intermediary role.
- **Decision:** No wallet, balance or spread code. Each `engage.messages` row records `cost_estimate_minor`, `currency`, and `rate_card_id` from the tenant's configured rate card per channel/route/category. Where the provider returns actual cost in DLR or billing data, store `cost_actual_minor`. Monthly budget caps per tenant and channel are enforced by the send gate (ADR-004). Money uses integer minor units plus a currency code. EUR conversion reuses `exchange_rates` for reporting only.
- **Consequences:** + transparent-economics feature ships early; the same ledger later supports margin if resale starts (Q6 triggers). − no messaging revenue for Messign in year 1 (accepted).
- **Rejected:** prepaid wallet (requires an entity, handles customer money, and requires reseller status).
