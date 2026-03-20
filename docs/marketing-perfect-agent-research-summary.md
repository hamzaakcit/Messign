# Perfect Marketing Agent — Research Summary (V2 alignment)

This document captures **design principles** aligned with the Marketing V2 architecture. Paste excerpts from *Executive Summary.pdf* here as they are finalized.

## Principles

1. **Strategy before execution** — Multi-step reasoning (ICP, competitors, metrics) precedes copy generation unless the user explicitly requests a trivial edit.
2. **Orchestrated growth** — Marketing is not “a chat that writes text”; it is a **closed loop**: plan → act → measure → learn → update memory (with HITL for brand changes).
3. **Autonomous but bounded** — Triggers and batch jobs run with **draft_and_wait** by default; production actions require explicit policy or approval.
4. **Tool honesty** — Heuristic SEO/conversion/social-listen outputs are **estimates**; live ad/search APIs are optional adapters.
5. **Three clocks** — Interactive (user), event/schedule-driven (workers), nightly learning (Learner trace).

## Mapping to implementation

| Principle | Code / artifact |
|-----------|------------------|
| Strategy-first loop | `step_kind: research` in strategy plan + research mini-loop in `marketingAgentFlow` |
| Triggers | `marketing_automation_triggers` + `eventBus` + `cross-module` worker |
| Golden examples | `memory:store_golden_example` (Learner-only) + optional `marketing:propose_brand_voice_patch` |
| Competitive / SEO | `marketing:competitor_social_listen`, `seo:keyword_optimizer`, `analytics:*`, `conversion:*` |

See [marketing-v2-architecture.md](./marketing-v2-architecture.md) for the full system map.
