# LiteLLM AI Gateway

LiteLLM runs as a separate service alongside the Node.js backend. It exposes an **OpenAI-compatible API** and handles:

- **Model routing** — Tier-based routing (fast → balanced → complex → frontier)
- **Fallbacks** — Automatic failover when primary model fails
- **Cost tracking** — Langfuse integration for spend visibility
- **Caching** — Redis-backed cache for identical prompts (1h TTL)

## Quick Start

### 1. Install LiteLLM

**Python 3.10+ required** (guardrails crash on 3.9). From the workspace root:

```bash
npm run litellm:install
```

Or manually with Python 3.11:

```bash
python3.11 -m pip install "litellm[proxy]"
```

Or with Docker:

```bash
docker run -p 4000:4000 \
  -v $(pwd)/litellm/config.yaml:/app/config.yaml \
  -e GROQ_API_KEY=$GROQ_API_KEY \
  -e GOOGLE_API_KEY=$GOOGLE_API_KEY \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e REDIS_HOST=localhost \
  -e REDIS_PORT=6379 \
  -e LITELLM_MASTER_KEY=sk-your-master-key \
  ghcr.io/berriai/litellm:main-latest \
  --config /app/config.yaml
```

### 2. Set environment variables

Create a `.env` in the project root or export:

```bash
# Required for model tiers
export GROQ_API_KEY=your-groq-key
export GOOGLE_API_KEY=your-gemini-key
export ANTHROPIC_API_KEY=your-anthropic-key
export OPENAI_API_KEY=your-openai-key           # for embeddings

# Redis (for semantic cache) — use same Redis as BullMQ
# Set REDIS_URL (from .env) or REDIS_HOST+REDIS_PORT. Cache enables 30%+ hit rate on fast tier.
export REDIS_HOST=localhost
export REDIS_PORT=6379
# Or: export REDIS_URL=redis://localhost:6379

# Master key for proxy auth (required — suppresses CRITICAL warning)
# Must match gateway.ts; use sk-litellm for local dev
export LITELLM_MASTER_KEY=sk-your-secret-key
```

**Python 3.10+ required:** LiteLLM guardrails use `dict | None` syntax (Python 3.10+). If you see `unsupported operand type(s) for |`, install Python 3.11: `brew install python@3.11` (or use pyenv).

### 3. Run the proxy

From the **workspace root**:

```bash
npm run litellm
```

Or directly:

```bash
litellm --config ./litellm/config.yaml
```

Runs on **http://0.0.0.0:4000** by default.

### 4. Test

When the proxy starts, you should see:

```
INFO: LiteLLM: Proxy running on http://0.0.0.0:4000
```

In a second terminal:

```bash
curl --request POST \
  --url http://localhost:4000/v1/chat/completions \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "fast",
    "messages": [{"role": "user", "content": "hey!"}]
  }'
```

If you set `LITELLM_MASTER_KEY`, add: `-H "Authorization: Bearer sk-your-secret-key"`

## Verification

End-to-end verification steps:

1. **Start LiteLLM:** `npm run litellm` — wait for `Uvicorn running on http://0.0.0.0:4000`

2. **Test LiteLLM directly:**
   ```bash
   curl -s -X POST http://localhost:4000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"fast","messages":[{"role":"user","content":"hi"}]}'
   ```
   Expect a JSON response with `choices[0].message.content`, not an error.

3. **Start server:** `npm run dev` (or `npm run dev:server`)

4. **Test Dora:** Ask "What are my open tasks?" or "Show me the MP leaderboard" in the Dora UI. You should get a real answer (or tool-driven response), not "I wasn't able to retrieve the data."

5. **Fallback test:** Stop LiteLLM (`Ctrl+C`), ask Dora again. The intent-router fallback (direct Groq/Gemini) should still answer when LiteLLM is down.

## Model Tiers

| Tier      | Model                          | Use case                          |
|-----------|--------------------------------|-----------------------------------|
| `fast`    | Groq Llama 3.3 70B             | Intent classification, extraction |
| `balanced`| Gemini 2.0 Flash Lite          | Summarization, drafting            |
| `complex` | Claude Sonnet 4                 | Multi-step reasoning               |
| `frontier`| Claude Opus 4                  | Hardest orchestration              |
| `vision`  | Claude Sonnet 4                | Receipt/invoice OCR                |
| `embeddings` | OpenAI text-embedding-3-small | Vector embeddings                  |

## Next Steps (Node.js integration)

After deploying LiteLLM, update `aiCascade.ts` and `taskRouter.ts` to call the proxy instead of direct provider APIs:

1. Point `OPENAI_BASE_URL` (or equivalent) to `http://localhost:4000`
2. Use `model: "fast"` | `"balanced"` | `"complex"` | `"frontier"` instead of provider-specific model names
3. Remove the manual cascade logic — LiteLLM handles fallbacks
