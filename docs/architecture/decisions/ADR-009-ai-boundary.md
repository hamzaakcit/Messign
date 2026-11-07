# ADR-009: AI in engage = drafts and suggestions through one metered gateway; no PII in prompts; no autonomous actions

- **Status:** Accepted (2026-11-07, with D-01)
- **Context:** Two LLM gateways exist; marketing calls are unmetered; Dora has broad tools. The market pushes "agentic" (Insider Agent One). Principle 7 requires human approval for sends, audiences, spend and deletion.
- **Decision:**
  - Engage AI features (journey copy drafting, subject lines, journey setup suggestions) call `services/ai/gateway.ts` only.
  - Every call writes `ai_request_telemetry` (org, feature, prompt id@version, model, tokens, cost estimate). A per-tenant monthly cap is checked before the call.
  - Prompt context excludes personal data (profiles, identifiers, events). Brand profile, product truth, templates and aggregates only.
  - Outputs go through the existing gatekeepers into the approval queue. No AI tool can send, change segments, change budgets or delete data.
  - The Dora assistant is frozen for engage tenants.
- **Consequences:** + defensible KVKK posture (no PII to US LLM providers); cost visibility. − no "agentic" marketing story in year 1; positioned as human-controlled AI.
- **Rejected:** Dora as the engage UX; autonomous journeys.
