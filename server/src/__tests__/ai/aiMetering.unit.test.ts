/**
 * AI call metering (WP-23), no database: price estimates, caller naming, nesting and stream outcomes. Each metered call
 * writes exactly one row through the sink; the sink here is an in-memory fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  callerFromStack,
  estimateServedCostUsd,
  meterAiCall,
  meterAiStream,
  recordServed,
  setAiMeteringDb,
} from '../../services/ai/metering.js';

type Row = unknown[];
let rows: Row[] = [];
const recordingQuery = async (text: string, params?: unknown[]) => {
  if (text.includes('INSERT INTO ai_call_telemetry')) rows.push(params ?? []);
  return { rows: [] as Array<Record<string, unknown>> };
};
const sink = { query: vi.fn(recordingQuery) };

beforeEach(() => {
  rows = [];
  sink.query.mockReset();
  sink.query.mockImplementation(recordingQuery);
  setAiMeteringDb(sink);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  setAiMeteringDb(null);
  vi.restoreAllMocks();
});

/** Column order of the INSERT in metering.ts */
const col = {
  caller: 0, tenantId: 1, kind: 2, tier: 3, provider: 4, model: 5, upstream: 6, tokensIn: 7, tokensOut: 8,
  latency: 9, outcome: 10, errorCode: 11, cost: 12, estimated: 13,
} as const;

describe('estimateServedCostUsd', () => {
  it('prices reported tokens by the matching model prefix', () => {
    const c = estimateServedCostUsd({ provider: 'groq', model: 'llama-3.3-70b-versatile', tokensIn: 1000, tokensOut: 500 }, 0);
    expect(c.estimated).toBe(false);
    expect(c.costUsd).toBeCloseTo((1000 * 0.59 + 500 * 0.79) / 1_000_000, 12);
  });

  it('prefers the longer model prefix (flash-lite is not flash)', () => {
    const lite = estimateServedCostUsd({ provider: 'gemini', model: 'gemini-2.5-flash-lite-001', tokensIn: 1_000_000, tokensOut: 0 }, 0);
    expect(lite.costUsd).toBeCloseTo(0.1, 9);
  });

  it('prices an unknown model at the dearest chat rate and marks it estimated', () => {
    const c = estimateServedCostUsd({ provider: 'x', model: 'mystery-model', tokensIn: 1_000_000, tokensOut: 1_000_000 }, 0);
    expect(c.estimated).toBe(true);
    expect(c.costUsd).toBeCloseTo(18, 9);
  });

  it('uses the fallback when the provider reported no tokens', () => {
    expect(estimateServedCostUsd({ provider: 'groq', model: 'llama-3.3-70b-versatile' }, 0.0005)).toEqual({ costUsd: 0.0005, estimated: true });
  });
});

describe('callerFromStack', () => {
  it('names the first frame outside the gateway files, relative to src', () => {
    const stack = [
      'Error',
      '    at captureCaller (/repo/server/src/services/ai/metering.ts:200:5)',
      '    at callModel (/repo/server/src/services/ai/gateway.ts:600:10)',
      '    at generateText (/repo/server/src/services/ai/gateway.ts:720:3)',
      '    at compliance (/repo/server/src/services/marketing/complianceScanner.ts:42:9)',
    ].join('\n');
    expect(callerFromStack(stack)).toBe('services/marketing/complianceScanner');
  });

  it('skips the image generators and node internals', () => {
    const stack = [
      'Error',
      '    at x (/repo/server/src/services/marketing/publishing/imageService/generateImage.ts:10:1)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
      '    at route (/repo/server/src/routes/marketing/images.ts:9:3)',
    ].join('\n');
    expect(callerFromStack(stack)).toBe('routes/marketing/images');
  });

  it('returns unknown when nothing outside the gateway is on the stack', () => {
    expect(callerFromStack('Error\n    at y (/repo/server/src/services/ai/gateway.ts:1:1)')).toBe('unknown');
  });
});

describe('meterAiCall', () => {
  it('writes one ok row with the served totals, and nested calls add no row', async () => {
    const result = await meterAiCall({ kind: 'chat', tier: 'fast', tenantId: 't-1' }, async () => {
      // An inner entry point (passthrough) plus two upstream responses inside the outer call.
      await meterAiCall({ kind: 'chat', tier: 'fast', tenantId: 't-1' }, async () => {
        recordServed({ provider: 'groq', model: 'llama-3.3-70b-versatile', tokensIn: 100, tokensOut: 10 });
        return 1;
      });
      recordServed({ provider: 'gemini', model: 'gemini-2.5-flash', tokensIn: 200, tokensOut: 20 });
      return 'done';
    });
    expect(result).toBe('done');
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r[col.outcome]).toBe('ok');
    expect(r[col.upstream]).toBe(2);
    expect(r[col.tokensIn]).toBe(300);
    expect(r[col.tokensOut]).toBe(30);
    expect(r[col.provider]).toBe('gemini');
    expect(r[col.tenantId]).toBe('t-1');
    expect(r[col.estimated]).toBe(false);
    expect(Number(r[col.cost])).toBeCloseTo((100 * 0.59 + 10 * 0.79 + 200 * 0.3 + 20 * 2.5) / 1e6, 6);
  });

  it('writes an error row with the error class and no cost when nothing was served, then rethrows', async () => {
    const boom = Object.assign(new Error('upstream said 429 for you'), {});
    await expect(meterAiCall({ kind: 'chat', tier: 'balanced' }, async () => { throw boom; })).rejects.toBe(boom);
    expect(rows).toHaveLength(1);
    expect(rows[0][col.outcome]).toBe('error');
    expect(rows[0][col.errorCode]).toBe('rate_limit');
    expect(rows[0][col.tenantId]).toBeNull();
    expect(rows[0][col.cost]).toBe('0.000000');
    expect(rows[0][col.upstream]).toBe(0);
  });

  it('takes the error code from an error that carries one', async () => {
    const err = Object.assign(new Error('bad'), { code: 'bad_request' });
    await expect(meterAiCall({ kind: 'chat' }, async () => { throw err; })).rejects.toBe(err);
    expect(rows[0][col.errorCode]).toBe('bad_request');
  });

  it('charges the fallback for a successful call that no upstream response was recorded for (images)', async () => {
    await meterAiCall({ kind: 'image', fallbackCostUsd: 0.08 }, async () => 'img');
    expect(rows[0][col.kind]).toBe('image');
    expect(rows[0][col.outcome]).toBe('ok');
    expect(Number(rows[0][col.cost])).toBeCloseTo(0.08, 6);
    expect(rows[0][col.estimated]).toBe(true);
  });

  it('still returns the result when the telemetry write fails', async () => {
    sink.query.mockRejectedValue(new Error('connection refused'));
    await expect(meterAiCall({ kind: 'chat' }, async () => 42)).resolves.toBe(42);
    expect(console.warn).toHaveBeenCalledWith('[ai-metering] could not write telemetry row', expect.anything());
  });
});

describe('meterAiStream', () => {
  async function* chunks(): AsyncGenerator<string> {
    yield 'a';
    yield 'b';
    yield 'c';
  }

  it('writes one ok row when the stream completes, with the fallback cost', async () => {
    const out: string[] = [];
    const stream = meterAiStream({ kind: 'stream', tier: 'fast' }, () => {
      recordServed({ provider: 'groq', model: 'llama-3.3-70b-versatile' });
      return chunks();
    });
    for await (const c of stream) out.push(c);
    expect(out).toEqual(['a', 'b', 'c']);
    expect(rows).toHaveLength(1);
    expect(rows[0][col.outcome]).toBe('ok');
    expect(rows[0][col.kind]).toBe('stream');
    expect(Number(rows[0][col.cost])).toBeCloseTo(0.0005, 6);
    expect(rows[0][col.estimated]).toBe(true);
  });

  it('writes one aborted row when the consumer stops early', async () => {
    const stream = meterAiStream({ kind: 'stream', tier: 'fast' }, () => chunks());
    for await (const c of stream) {
      expect(c).toBe('a');
      break;
    }
    expect(rows).toHaveLength(1);
    expect(rows[0][col.outcome]).toBe('aborted');
  });

  it('writes one error row when the stream throws', async () => {
    async function* failing(): AsyncGenerator<string> {
      yield 'a';
      throw new Error('stream reset 503');
    }
    const stream = meterAiStream({ kind: 'stream' }, () => failing());
    await expect((async () => { for await (const _ of stream) void _; })()).rejects.toThrow('stream reset 503');
    expect(rows).toHaveLength(1);
    expect(rows[0][col.outcome]).toBe('error');
    expect(rows[0][col.errorCode]).toBe('server_error');
  });

  it('a stream started inside a metered call adds no row of its own', async () => {
    await meterAiCall({ kind: 'chat' }, async () => {
      const inner = meterAiStream({ kind: 'stream' }, () => chunks());
      for await (const _ of inner) void _;
      return null;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0][col.kind]).toBe('chat');
  });
});
