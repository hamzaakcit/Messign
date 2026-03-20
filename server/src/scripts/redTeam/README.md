# Marketing gatekeepers — red team

Validates **Product Truth Validator**, **Brand Voice Checker**, and **Compliance Scanner** using synthetic truth/brand markdown (`mockMarketingContext.ts`) so no database rows are required.

## Commands

| Command | Description |
|--------|-------------|
| `npm run test:red-team:mock` | Deterministic: canned JSON responses, full schema + behavioral assertions for cases A and C. |
| `npm run test:red-team` | Live: calls `callModelSafe` (Groq direct or LiteLLM when `LITELLM_URL` is set). Validates JSON shape; behavioral checks only if `RED_TEAM_STRICT=1`. |

Environment:

- `RED_TEAM_MOCK_LLM=1` — use canned LLM outputs (no API keys).
- `RED_TEAM_STRICT=1` — with live LLM, enforce Case A / Case C behavioral expectations (may fail if the model disagrees).

## Files

- `mockMarketingContext.ts` — feature registry, claims, blocked patterns, glossary, brand profile, golden/anti examples; builders for markdown blocks.
- `gatekeeperSchemaValidation.ts` — structural checks + raw-output heuristics (no markdown fences).
- `redTeamCannedLlmResponses.ts` — JSON strings for mock mode only.
- `testMarketingGatekeepers.ts` — runner (cases A–D).

Production services accept optional `*ContextMdOverride` and `redTeamRawResponseOverride` / `onRawModelResponse` for this harness only.
