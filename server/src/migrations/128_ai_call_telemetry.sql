-- WP-23: AI gateway metering and a per-tenant monthly budget.
--
-- ai_call_telemetry gets exactly one row per AI call that enters the gateway (chat, stream, embedding, image),
-- whatever the outcome. Nested gateway calls made inside one entry point are folded into that entry's row
-- (upstream_calls counts the provider responses that were actually received). No prompt, completion or
-- personal data is stored: caller is a source path, tenant_id is an organization id, error_code is a class.
-- Cost is an estimate from the price table in services/ai/metering.ts; cost_estimated says when a price
-- or token count was assumed rather than reported.
CREATE TABLE IF NOT EXISTS public.ai_call_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  caller text NOT NULL CHECK (char_length(caller) BETWEEN 1 AND 300),
  tenant_id text CHECK (tenant_id IS NULL OR char_length(tenant_id) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK (kind IN ('chat', 'stream', 'embedding', 'image')),
  tier text CHECK (tier IS NULL OR char_length(tier) BETWEEN 1 AND 40),
  provider text CHECK (provider IS NULL OR char_length(provider) BETWEEN 1 AND 60),
  model text CHECK (model IS NULL OR char_length(model) BETWEEN 1 AND 200),
  upstream_calls integer NOT NULL DEFAULT 0 CHECK (upstream_calls >= 0),
  tokens_in integer CHECK (tokens_in IS NULL OR tokens_in >= 0),
  tokens_out integer CHECK (tokens_out IS NULL OR tokens_out >= 0),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  outcome text NOT NULL CHECK (outcome IN ('ok', 'error', 'aborted', 'budget_exceeded')),
  error_code text CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 40),
  cost_usd numeric(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  cost_estimated boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS ai_call_telemetry_tenant_created_idx ON public.ai_call_telemetry (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS ai_call_telemetry_created_idx ON public.ai_call_telemetry (created_at);

-- A tenant with a row here is refused new AI calls once its spend this calendar month (UTC) reaches the cap.
-- No row means no cap (calls are still metered). Written by setAiTenantBudget in services/ai/metering.ts.
CREATE TABLE IF NOT EXISTS public.ai_tenant_budgets (
  tenant_id text PRIMARY KEY CHECK (char_length(tenant_id) BETWEEN 1 AND 200),
  monthly_cap_usd numeric(12, 4) NOT NULL CHECK (monthly_cap_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
