/**
 * AI call metering and per-tenant monthly budget (WP-23).
 *
 * Every entry point of the AI gateway (services/ai/gateway.ts, llmGateway.ts, groqToolCalling.ts and the image
 * generators) runs through {@link meterAiCall} or {@link meterAiStream}. One call writes exactly one row to
 * `ai_call_telemetry` (migration 128), whatever the outcome:
 *   - ok, error, aborted (a stream the consumer stopped early) or budget_exceeded (refused before any provider call).
 * Entry points nest (generateText -> callModelSafe -> callModel -> provider). Only the outermost one opens a frame and
 * writes a row; the inner ones are passthroughs. Every successful provider response reported by a leaf is added to the
 * frame, so a row carries the sum of tokens and cost of the upstream calls that served it, and upstream_calls.
 *
 * Budget: when a tenant has a row in `ai_tenant_budgets`, the outermost call is refused with
 * {@link AiBudgetExceededError} once that tenant's spend this UTC month (sum of cost_usd) has reached the cap.
 * The check runs before any provider is contacted. Known limits: calls in flight at the same moment can overshoot the
 * cap by roughly their own cost; if the database cannot be read the check fails open and the warning is logged.
 *
 * Privacy: rows hold a source path (caller), a tenant id, provider, model, token counts, latency, an error class and
 * a cost. No prompt, completion, or error text is stored.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type AiCallKind = 'chat' | 'stream' | 'embedding' | 'image';
export type AiCallOutcome = 'ok' | 'error' | 'aborted' | 'budget_exceeded';

export interface AiCallMeta {
  kind: AiCallKind;
  tier?: string | null;
  tenantId?: string | null;
  /** Cost assumed for a provider response that reported no tokens (streams, images). Defaults by tier. */
  fallbackCostUsd?: number;
}

/** One successful upstream provider response, as reported by the leaf that made it. */
export interface ServedCall {
  provider: string;
  model: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
}

interface Frame {
  kind: AiCallKind;
  tier: string | null;
  tenantId: string | null;
  fallbackCostUsd: number | undefined;
  caller: string;
  startedAt: number;
  served: ServedCall[];
}

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export class AiBudgetExceededError extends Error {
  readonly code = 'budget_exceeded';

  readonly tenantId: string;

  constructor(tenantId: string) {
    super(`AI budget for tenant ${tenantId} is used up for this month`);
    this.name = 'AiBudgetExceededError';
    this.tenantId = tenantId;
  }
}

/** USD per million tokens, [input, output]. Estimates: check against the provider's current price list. */
const PRICE_USD_PER_MTOK: Array<{ prefix: string; input: number; output: number }> = [
  { prefix: 'llama-3.3-70b', input: 0.59, output: 0.79 },
  { prefix: 'gemini-2.5-flash-lite', input: 0.1, output: 0.4 },
  { prefix: 'gemini-2.5-flash', input: 0.3, output: 2.5 },
  { prefix: 'gemini-2.0-flash-lite', input: 0.075, output: 0.3 },
  { prefix: 'gemini-1.5-flash', input: 0.075, output: 0.3 },
  { prefix: 'claude-sonnet-4', input: 3, output: 15 },
  { prefix: 'text-embedding-3-small', input: 0.02, output: 0 },
];

/** Unknown models are priced at the most expensive chat rate so the budget never under-counts. */
const UNKNOWN_MODEL_PRICE = { input: 3, output: 15 };

/** Per-call cost when a stream or similar call reports no tokens. Mirrors the tier estimates used for cache savings. */
const TIER_FALLBACK_COST_USD: Record<string, number> = {
  fast: 0.0005,
  balanced: 0.002,
  complex: 0.01,
  frontier: 0.05,
  vision: 0.01,
};
const DEFAULT_FALLBACK_COST_USD = 0.002;

/** Per image request (no token counts from image providers). Conservative: the dearer published rates are about $0.04 to $0.08. */
export const IMAGE_FALLBACK_COST_USD = 0.08;

const frameStorage = new AsyncLocalStorage<Frame>();

let dbOverride: Queryable | null = null;

/** Tests point metering at a specific database. Pass null to return to the server pool. */
export function setAiMeteringDb(db: Queryable | null): void {
  dbOverride = db;
}

async function resolveDb(): Promise<Queryable> {
  if (dbOverride) return dbOverride;
  const { pool } = await import('../../db/index.js');
  return pool as unknown as Queryable;
}

/** Source files that sit between a caller and the metered entry point; skipped when naming the caller. */
const GATEWAY_FILES =
  /(?:services\/ai\/(?:gateway|llmGateway|metering|groqToolCalling)|services\/marketing\/publishing\/imageService\/(?:generateImage|falImageGeneration|falKontextEdit|falFluxI2iEdit))\.[cm]?[jt]s$/;

/**
 * Name of the code that called into the gateway: the first stack frame outside the gateway's own files,
 * shortened to the path below src/ or dist/. Must run synchronously in the entry point.
 */
export function callerFromStack(stack: string | undefined = new Error().stack): string {
  if (!stack) return 'unknown';
  for (const line of stack.split('\n').slice(1)) {
    const match = line.match(/([^\s(]+):\d+:\d+\)?\s*$/);
    if (!match) continue;
    const file = match[1].replace(/^file:\/\//, '');
    if (file.includes('node_modules') || file.startsWith('node:') || file.includes('<anonymous>')) continue;
    if (GATEWAY_FILES.test(file)) continue;
    const marker = file.lastIndexOf('/src/') >= 0 ? file.lastIndexOf('/src/') + 5 : file.lastIndexOf('/dist/') >= 0 ? file.lastIndexOf('/dist/') + 6 : -1;
    const shown = (marker >= 0 ? file.slice(marker) : file.split('/').slice(-2).join('/')).replace(/\.[cm]?[jt]s$/, '');
    return shown.slice(0, 300);
  }
  return 'unknown';
}

function captureCaller(): string {
  const previous = Error.stackTraceLimit;
  Error.stackTraceLimit = 40;
  try {
    return callerFromStack(new Error().stack);
  } finally {
    Error.stackTraceLimit = previous;
  }
}

function priceFor(model: string): { input: number; output: number; known: boolean } {
  let best: { prefix: string; input: number; output: number } | undefined;
  for (const entry of PRICE_USD_PER_MTOK) {
    if (model.startsWith(entry.prefix) && (!best || entry.prefix.length > best.prefix.length)) best = entry;
  }
  if (!best) return { ...UNKNOWN_MODEL_PRICE, known: false };
  return { input: best.input, output: best.output, known: true };
}

/** Cost of one served response: token-priced when the provider reported usage, otherwise the fallback. */
export function estimateServedCostUsd(
  served: ServedCall,
  fallbackUsd: number,
): { costUsd: number; estimated: boolean } {
  if (served.tokensIn == null && served.tokensOut == null) return { costUsd: fallbackUsd, estimated: true };
  const price = priceFor(served.model);
  const costUsd = ((served.tokensIn ?? 0) * price.input + (served.tokensOut ?? 0) * price.output) / 1_000_000;
  return { costUsd, estimated: !price.known };
}

function fallbackFor(frame: Frame): number {
  if (frame.fallbackCostUsd != null) return frame.fallbackCostUsd;
  return (frame.tier && TIER_FALLBACK_COST_USD[frame.tier]) || DEFAULT_FALLBACK_COST_USD;
}

/** Records one successful upstream provider response into the current call. No-op outside a metered call. */
export function recordServed(served: ServedCall): void {
  frameStorage.getStore()?.served.push(served);
}

function errorCodeOf(err: unknown): string {
  const direct = (err as { code?: unknown } | null)?.code;
  if (typeof direct === 'string' && /^[a-z_]{1,40}$/.test(direct)) return direct;
  const message = err instanceof Error ? err.message : String(err);
  if (/\b429\b|rate_limit/i.test(message)) return 'rate_limit';
  if (/timeout|timed out|abort/i.test(message)) return 'timeout';
  if (/\b5\d\d\b/.test(message)) return 'server_error';
  if (/\b4\d\d\b/.test(message)) return 'client_error';
  return 'error';
}

async function writeRow(frame: Frame, outcome: AiCallOutcome, errorCode: string | null): Promise<void> {
  const served = frame.served;
  let costUsd = 0;
  let estimated = false;
  if (served.length > 0) {
    for (const s of served) {
      const c = estimateServedCostUsd(s, fallbackFor(frame));
      costUsd += c.costUsd;
      estimated = estimated || c.estimated;
    }
  } else if (outcome === 'ok' || outcome === 'aborted') {
    // The call succeeded (or was abandoned mid-stream) but no leaf reported a response: charge the fallback.
    costUsd = fallbackFor(frame);
    estimated = true;
  }
  const last = served[served.length - 1];
  const sum = (pick: (s: ServedCall) => number | null | undefined): number | null => {
    const values = served.map(pick).filter((v): v is number => v != null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  try {
    const db = await resolveDb();
    await db.query(
      `INSERT INTO ai_call_telemetry (
         caller, tenant_id, kind, tier, provider, model, upstream_calls, tokens_in, tokens_out,
         latency_ms, outcome, error_code, cost_usd, cost_estimated
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        frame.caller,
        frame.tenantId,
        frame.kind,
        frame.tier,
        last?.provider ?? null,
        last?.model ?? null,
        served.length,
        sum((s) => s.tokensIn),
        sum((s) => s.tokensOut),
        Math.max(0, Math.round(performance.now() - frame.startedAt)),
        outcome,
        errorCode,
        costUsd.toFixed(6),
        estimated,
      ],
    );
  } catch (err) {
    console.warn('[ai-metering] could not write telemetry row', {
      caller: frame.caller,
      outcome,
      message: err instanceof Error ? err.message.slice(0, 200) : 'unknown error',
    });
  }
}

/** Spend this UTC month and the cap, when the tenant has a budget row. Null means the call may proceed. */
export async function checkAiBudget(tenantId: string): Promise<{ capUsd: number; spentUsd: number } | null> {
  try {
    const db = await resolveDb();
    const result = await db.query(
      `SELECT b.monthly_cap_usd::float8 AS cap,
              (SELECT COALESCE(SUM(t.cost_usd), 0)::float8 FROM ai_call_telemetry t
                WHERE t.tenant_id = b.tenant_id
                  AND t.created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS spent
         FROM ai_tenant_budgets b
        WHERE b.tenant_id = $1`,
      [tenantId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const capUsd = Number(row.cap);
    const spentUsd = Number(row.spent);
    return spentUsd >= capUsd ? { capUsd, spentUsd } : null;
  } catch (err) {
    console.warn('[ai-metering] budget check failed open', {
      message: err instanceof Error ? err.message.slice(0, 200) : 'unknown error',
    });
    return null;
  }
}

/** Creates or replaces a tenant's monthly AI budget. */
export async function setAiTenantBudget(tenantId: string, monthlyCapUsd: number): Promise<void> {
  if (!Number.isFinite(monthlyCapUsd) || monthlyCapUsd < 0) throw new Error('monthlyCapUsd must be a non-negative number');
  const db = await resolveDb();
  await db.query(
    `INSERT INTO ai_tenant_budgets (tenant_id, monthly_cap_usd, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (tenant_id) DO UPDATE SET monthly_cap_usd = EXCLUDED.monthly_cap_usd, updated_at = now()`,
    [tenantId, monthlyCapUsd.toFixed(4)],
  );
}

function newFrame(meta: AiCallMeta): Frame {
  return {
    kind: meta.kind,
    tier: meta.tier ?? null,
    tenantId: meta.tenantId ?? null,
    fallbackCostUsd: meta.fallbackCostUsd,
    caller: captureCaller(),
    startedAt: performance.now(),
    served: [],
  };
}

/**
 * Runs one promise-returning gateway entry point with metering. Nested inside another metered call, it only runs `fn`.
 * Call it synchronously from the public entry point so the caller can be named from the stack.
 */
export function meterAiCall<T>(meta: AiCallMeta, fn: () => Promise<T>): Promise<T> {
  if (frameStorage.getStore()) return fn();
  const frame = newFrame(meta);
  return runMetered(frame, fn);
}

async function runMetered<T>(frame: Frame, fn: () => Promise<T>): Promise<T> {
  if (frame.tenantId) {
    const gate = await checkAiBudget(frame.tenantId);
    if (gate) {
      await writeRow(frame, 'budget_exceeded', 'budget_exceeded');
      throw new AiBudgetExceededError(frame.tenantId);
    }
  }
  try {
    const result = await frameStorage.run(frame, fn);
    await writeRow(frame, 'ok', null);
    return result;
  } catch (err) {
    await writeRow(frame, 'error', errorCodeOf(err));
    throw err;
  }
}

/**
 * Stream variant of {@link meterAiCall}. The row is written when the stream finishes, fails, or the consumer stops it.
 */
export function meterAiStream<T>(meta: AiCallMeta, open: () => AsyncIterable<T>): AsyncGenerator<T, void, unknown> {
  if (frameStorage.getStore()) return passthroughStream(open);
  const frame = newFrame(meta);
  return runMeteredStream(frame, open);
}

async function* passthroughStream<T>(open: () => AsyncIterable<T>): AsyncGenerator<T, void, unknown> {
  yield* open();
}

async function* runMeteredStream<T>(frame: Frame, open: () => AsyncIterable<T>): AsyncGenerator<T, void, unknown> {
  if (frame.tenantId) {
    const gate = await checkAiBudget(frame.tenantId);
    if (gate) {
      await writeRow(frame, 'budget_exceeded', 'budget_exceeded');
      throw new AiBudgetExceededError(frame.tenantId);
    }
  }
  const iterator = frameStorage.run(frame, () => open()[Symbol.asyncIterator]());
  let outcome: AiCallOutcome = 'aborted';
  let errorCode: string | null = null;
  try {
    for (;;) {
      const step = await frameStorage.run(frame, () => iterator.next());
      if (step.done) {
        outcome = 'ok';
        break;
      }
      yield step.value;
    }
  } catch (err) {
    outcome = 'error';
    errorCode = errorCodeOf(err);
    throw err;
  } finally {
    // Reached without finishing the stream: the consumer stopped it (outcome stays 'aborted').
    await frameStorage.run(frame, async () => {
      await iterator.return?.(undefined);
    }).catch(() => undefined);
    await writeRow(frame, outcome, errorCode);
  }
}
