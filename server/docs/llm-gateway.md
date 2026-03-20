# Unified LLM gateway (`llmGateway.ts`)

Marketing agents and validators can call **`generateResponse`** in [`src/services/ai/llmGateway.ts`](../src/services/ai/llmGateway.ts) for a single interface over:

| Tier | Default backend | Default model | Timeout | Retries |
|------|-----------------|---------------|---------|---------|
| `complex` | Anthropic | `claude-3-5-sonnet-20241022` (`LLM_COMPLEX_MODEL`) | 45s | 3 (429 / 5xx) |
| `fast` | Groq (OpenAI-compatible) | `llama-3.3-70b-versatile` (`LLM_FAST_MODEL`) | 15s | 3 (429 / 5xx) |

Existing code paths may still use [`gateway.ts`](../src/services/ai/gateway.ts) (`callModelSafe`) with LiteLLM + direct Groq/Gemini fallbacks; migrate orchestration and validators to `llmGateway` incrementally.

## Environment

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Required for **complex** tier |
| `GROQ_API_KEY` | Required for **fast** tier |
| `LLM_COMPLEX_MODEL` | Override Claude model id |
| `LLM_FAST_MODEL` | Override Groq model (e.g. `llama3-8b-8192` if you standardize on 8B) |
| `LLM_COMPLEX_TIMEOUT_MS` / `LLM_FAST_TIMEOUT_MS` | Override defaults |
| `GROQ_OPENAI_BASE_URL` | Optional: point Groq client at a **LiteLLM** OpenAI-compatible base (e.g. `https://<host>/v1`) instead of `https://api.groq.com/openai/v1` |

## LiteLLM proxy (Groq path)

1. Run LiteLLM with Groq provider credentials (see repo `litellm/config.yaml` if present).
2. Set `GROQ_OPENAI_BASE_URL` to your LiteLLM `/v1` URL and use a key LiteLLM accepts (`LITELLM_MASTER_KEY` or provider key as configured).
3. Keep `LLM_FAST_MODEL` aligned with the model id LiteLLM routes (e.g. `llama-3.3-70b-versatile`).

**Anthropic / complex** tier uses the official `@anthropic-ai/sdk` against `api.anthropic.com` unless you later add an OpenAI-compatible adapter path.

## Errors

Failures surface as **`LLMGatewayError`** with `code`: `timeout` | `rate_limit` | `server_error` | `bad_request` | `unknown`.
