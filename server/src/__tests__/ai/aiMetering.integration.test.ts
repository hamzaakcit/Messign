/**
 * AI call metering and the per-tenant monthly budget (WP-23) on real Postgres. The providers are fakes (no network):
 * the gateway's own code runs, so the rows come from the real entry points, including failures.
 * Acceptance: one ai_call_telemetry row per call on every path (chat, failover, stream, embedding, tool path, JSON path,
 * failure, refusal); a tenant over its budget is refused server-side before any provider is called.
 * ENGAGE_TEST_ADMIN_URL=postgresql://postgres@localhost:5433/engage_scratch npx vitest run src/__tests__/ai/aiMetering.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import pg from 'pg';
import { runMigrations } from '../../migrations/runner.js';

const adminUrl = process.env.ENGAGE_TEST_ADMIN_URL;

const fake = vi.hoisted(() => ({
  openaiCreate: vi.fn(),
  embedCreate: vi.fn(),
  anthropicCreate: vi.fn(),
}));

vi.mock('openai', () => {
  class FakeOpenAI {
    chat = { completions: { create: (...args: unknown[]) => fake.openaiCreate(...args) } };
    embeddings = { create: (...args: unknown[]) => fake.embedCreate(...args) };
    constructor(_options?: unknown) { void _options; }
  }
  return { default: FakeOpenAI, OpenAI: FakeOpenAI };
});

vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = { create: (...args: unknown[]) => fake.anthropicCreate(...args) };
    constructor(_options?: unknown) { void _options; }
  }
  return { default: FakeAnthropic };
});

const completion = (content: string, promptTokens = 1000, completionTokens = 500) => ({
  id: 'cmpl-test',
  object: 'chat.completion',
  created: 0,
  model: 'llama-3.3-70b-versatile',
  choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop', logprobs: null }],
  usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
});

/** Mirrors the SDKs: the status code appears in the message as well as on the error. */
function providerError(status: number, message: string): Error {
  return Object.assign(new Error(`${status} ${message}`), { status });
}

async function* streamChunks(parts: string[]): AsyncGenerator<unknown> {
  for (const p of parts) yield { choices: [{ delta: { content: p }, index: 0 }] };
}

describe.skipIf(!adminUrl)('AI metering and budget (real Postgres)', () => {
  let pool: pg.Pool;
  let metering: typeof import('../../services/ai/metering.js');
  let gateway: typeof import('../../services/ai/gateway.js');
  let llm: typeof import('../../services/ai/llmGateway.js');
  let tools: typeof import('../../services/ai/groqToolCalling.js');
  const spies: Array<{ mockRestore: () => void }> = [];

  const tenant = () => `ai-test-${randomUUID()}`;

  interface Row {
    caller: string; kind: string; tier: string | null; provider: string | null; model: string | null;
    upstream_calls: number; tokens_in: number | null; tokens_out: number | null; outcome: string;
    error_code: string | null; cost: number; cost_estimated: boolean;
  }
  const rowsFor = async (tenantId: string): Promise<Row[]> =>
    (await pool.query<Row>(
      `SELECT caller, kind, tier, provider, model, upstream_calls, tokens_in, tokens_out, outcome, error_code,
              cost_usd::float8 AS cost, cost_estimated
         FROM ai_call_telemetry WHERE tenant_id = $1 ORDER BY created_at, id`,
      [tenantId],
    )).rows;

  beforeAll(async () => {
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.GOOGLE_GEMINI_API_KEY = 'test-gemini-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    delete process.env.LITELLM_URL;
    await runMigrations({ connectionString: adminUrl!, log: () => undefined });
    pool = new pg.Pool({ connectionString: adminUrl, max: 3 });
    for (const m of ['log', 'info', 'warn', 'error'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    metering = await import('../../services/ai/metering.js');
    gateway = await import('../../services/ai/gateway.js');
    llm = await import('../../services/ai/llmGateway.js');
    tools = await import('../../services/ai/groqToolCalling.js');
    metering.setAiMeteringDb(pool);
  }, 120_000);

  afterAll(async () => {
    metering?.setAiMeteringDb(null);
    spies.forEach((s) => s.mockRestore());
    await pool?.end();
  });

  beforeEach(() => {
    fake.openaiCreate.mockReset();
    fake.embedCreate.mockReset();
    fake.anthropicCreate.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('a successful chat call writes one row with tokens, model, provider and a token-priced cost', async () => {
    const t = tenant();
    fake.openaiCreate.mockResolvedValueOnce(completion('hello'));
    const res = await gateway.callModelSafe({ tier: 'fast', messages: [{ role: 'user', content: 'hi' }], tenantId: t });
    expect(res.choices[0].message.content).toBe('hello');
    const rows = await rowsFor(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'chat', tier: 'fast', provider: 'groq', model: 'llama-3.3-70b-versatile', upstream_calls: 1,
      tokens_in: 1000, tokens_out: 500, outcome: 'ok', error_code: null, cost_estimated: false,
    });
    expect(rows[0].cost).toBeCloseTo((1000 * 0.59 + 500 * 0.79) / 1e6, 6);
    expect(rows[0].caller).toContain('aiMetering.integration.test');
  });

  it('generateText (a nested entry) writes one row, not two', async () => {
    const t = tenant();
    fake.openaiCreate.mockResolvedValueOnce(completion('nested'));
    expect(await gateway.generateText({ tier: 'fast', prompt: 'x', tenantId: t })).toBe('nested');
    expect(await rowsFor(t)).toHaveLength(1);
  });

  it('when every provider fails, the call still writes one error row (server_error, no cost) and rethrows', async () => {
    const t = tenant();
    fake.openaiCreate.mockRejectedValue(providerError(503, 'Service Unavailable'));
    fake.anthropicCreate.mockRejectedValue(providerError(503, 'Service Unavailable'));
    await expect(gateway.callModelSafe({ tier: 'fast', messages: [{ role: 'user', content: 'hi' }], tenantId: t })).rejects.toThrow(/All direct LLM providers failed/);
    const rows = await rowsFor(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'chat', outcome: 'error', error_code: 'server_error', upstream_calls: 0, cost: 0 });
  });

  it('a failover that succeeds on a later provider records the served provider once', async () => {
    const t = tenant();
    fake.openaiCreate
      .mockRejectedValueOnce(providerError(503, 'groq down'))
      .mockResolvedValueOnce({ ...completion('from gemini'), model: 'gemini-2.5-flash' });
    await gateway.callModelSafe({ tier: 'fast', messages: [{ role: 'user', content: 'hi' }], tenantId: t });
    const rows = await rowsFor(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'ok', provider: 'gemini', upstream_calls: 1 });
  });

  it('a streamed reply writes one stream row with the fallback cost, marked estimated', async () => {
    const t = tenant();
    fake.openaiCreate.mockResolvedValueOnce(streamChunks(['he', 'llo']));
    let text = '';
    for await (const chunk of gateway.streamModelSafe({ tier: 'fast', messages: [{ role: 'user', content: 'hi' }], tenantId: t })) {
      text += (chunk as { choices: Array<{ delta: { content?: string } }> }).choices[0].delta.content ?? '';
    }
    expect(text).toBe('hello');
    const rows = await rowsFor(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'stream', outcome: 'ok', provider: 'groq', tokens_in: null, cost_estimated: true });
    expect(rows[0].cost).toBeCloseTo(0.0005, 6);
  });

  it('a stream the consumer stops early writes one aborted row', async () => {
    const t = tenant();
    fake.openaiCreate.mockResolvedValueOnce(streamChunks(['a', 'b', 'c']));
    for await (const _ of gateway.streamModelSafe({ tier: 'fast', messages: [{ role: 'user', content: 'hi' }], tenantId: t })) {
      void _;
      break;
    }
    const rows = await rowsFor(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe('aborted');
  });

  it('an embedding call writes one embedding row with the reported tokens', async () => {
    const t = tenant();
    fake.embedCreate.mockResolvedValueOnce({ data: [{ index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 10, total_tokens: 10 } });
    expect(await gateway.embedViaGateway(['some text'], t)).toEqual([[0.1, 0.2]]);
    const rows = await rowsFor(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'embedding', provider: 'openai', model: 'text-embedding-3-small', tokens_in: 10, outcome: 'ok' });
  });

  it('the JSON-mode gateway (generateResponse) writes one row, and a 400 writes an error row with bad_request', async () => {
    const ok = tenant();
    fake.openaiCreate.mockResolvedValueOnce(completion('{"ok":true}'));
    const result = await llm.generateResponse({ tier: 'fast', systemPrompt: 's', userMessage: 'u', jsonMode: true, tenantId: ok });
    expect(result.content).toBe('{"ok":true}');
    expect(await rowsFor(ok)).toMatchObject([{ kind: 'chat', tier: 'fast', provider: 'groq', outcome: 'ok', upstream_calls: 1 }]);

    const bad = tenant();
    fake.openaiCreate.mockRejectedValueOnce(providerError(400, 'invalid request'));
    await expect(llm.generateResponse({ tier: 'fast', systemPrompt: 's', userMessage: 'u', tenantId: bad })).rejects.toThrow();
    expect(await rowsFor(bad)).toMatchObject([{ kind: 'chat', outcome: 'error', error_code: 'bad_request', cost: 0 }]);
  });

  it('the direct-fetch tool path writes one row for the provider that answered, and one error row when it fails', async () => {
    const ok = tenant();
    // Every SDK tier fails, so callGroqWithTools falls back to the direct fetch to Groq.
    fake.openaiCreate.mockRejectedValue(providerError(503, 'down'));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'direct' } }] }), { status: 200 }));
    const reply = await tools.callGroqWithTools('sys', 'question', [], [], ok);
    expect(reply.content).toBe('direct');
    expect(await rowsFor(ok)).toMatchObject([{ kind: 'chat', provider: 'groq', outcome: 'ok', upstream_calls: 1, cost_estimated: true }]);

    const failed = tenant();
    vi.mocked(fetch).mockResolvedValueOnce(new Response('nope', { status: 500 }));
    await expect(tools.callGroqWithTools('sys', 'question', [], [], failed)).rejects.toThrow(/Groq API error 500/);
    expect(await rowsFor(failed)).toMatchObject([{ kind: 'chat', outcome: 'error', error_code: 'server_error', cost: 0 }]);
    fake.openaiCreate.mockReset();
  });

  it('a tenant over its monthly budget is refused before any provider is called, and the refusal is metered', async () => {
    const t = tenant();
    await metering.setAiTenantBudget(t, 0.0005);

    // First call: spend this month is 0, under the cap, so it goes through and costs about $0.00098.
    fake.openaiCreate.mockResolvedValueOnce(completion('first'));
    await gateway.callModelSafe({ tier: 'fast', messages: [{ role: 'user', content: 'a' }], tenantId: t });
    expect(fake.openaiCreate).toHaveBeenCalledTimes(1);

    // Second call: spend has reached the cap. Refused; no provider call.
    await expect(gateway.callModelSafe({ tier: 'fast', messages: [{ role: 'user', content: 'b' }], tenantId: t }))
      .rejects.toBeInstanceOf(metering.AiBudgetExceededError);
    expect(fake.openaiCreate).toHaveBeenCalledTimes(1);

    const rows = await rowsFor(t);
    expect(rows.map((r) => r.outcome)).toEqual(['ok', 'budget_exceeded']);
    expect(rows[1]).toMatchObject({ error_code: 'budget_exceeded', cost: 0, upstream_calls: 0 });
  });

  it('the refusal also applies to the JSON-mode gateway and the stream path', async () => {
    const t = tenant();
    await metering.setAiTenantBudget(t, 0.0001);
    await pool.query(
      `INSERT INTO ai_call_telemetry (caller, tenant_id, kind, latency_ms, outcome, cost_usd) VALUES ('seed', $1, 'chat', 1, 'ok', 0.5)`,
      [t],
    );
    await expect(llm.generateResponse({ tier: 'fast', systemPrompt: 's', userMessage: 'u', tenantId: t })).rejects.toBeInstanceOf(metering.AiBudgetExceededError);
    await expect((async () => {
      for await (const _ of gateway.streamModelSafe({ tier: 'fast', messages: [{ role: 'user', content: 'x' }], tenantId: t })) void _;
    })()).rejects.toBeInstanceOf(metering.AiBudgetExceededError);
    expect(fake.openaiCreate).not.toHaveBeenCalled();
    expect((await rowsFor(t)).map((r) => r.outcome)).toEqual(['ok', 'budget_exceeded', 'budget_exceeded']);
  });

  it('spend is counted per tenant: another tenant with no budget row is not refused', async () => {
    const capped = tenant();
    const other = tenant();
    await metering.setAiTenantBudget(capped, 0.0001);
    await pool.query(`INSERT INTO ai_call_telemetry (caller, tenant_id, kind, latency_ms, outcome, cost_usd) VALUES ('seed', $1, 'chat', 1, 'ok', 1)`, [capped]);
    fake.openaiCreate.mockResolvedValueOnce(completion('free'));
    await expect(gateway.callModelSafe({ tier: 'fast', messages: [{ role: 'user', content: 'x' }], tenantId: other })).resolves.toBeDefined();
    expect(await rowsFor(other)).toMatchObject([{ outcome: 'ok' }]);
  });

  it('raising the cap lets the tenant call again', async () => {
    const t = tenant();
    await pool.query(`INSERT INTO ai_call_telemetry (caller, tenant_id, kind, latency_ms, outcome, cost_usd) VALUES ('seed', $1, 'chat', 1, 'ok', 2)`, [t]);
    await metering.setAiTenantBudget(t, 1);
    await expect(gateway.generateText({ tier: 'fast', prompt: 'x', tenantId: t })).rejects.toBeInstanceOf(metering.AiBudgetExceededError);
    await metering.setAiTenantBudget(t, 5);
    fake.openaiCreate.mockResolvedValueOnce(completion('back'));
    expect(await gateway.generateText({ tier: 'fast', prompt: 'x', tenantId: t })).toBe('back');
  });

  it('a telemetry write failure does not fail the AI call', async () => {
    const broken = { query: async () => { throw new Error('db unavailable'); } };
    metering.setAiMeteringDb(broken);
    try {
      fake.openaiCreate.mockResolvedValueOnce(completion('still works'));
      expect(await gateway.generateText({ tier: 'fast', prompt: 'x', tenantId: tenant() })).toBe('still works');
    } finally {
      metering.setAiMeteringDb(pool);
    }
  });
});
